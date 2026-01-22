/**
 * Express Server - OpenAI-compatible API
 * Proxies to antigravity-claude-proxy (Anthropic format)
 */

import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { convertOpenAIToAnthropic } from './format/openai-to-anthropic.js';
import { convertAnthropicToOpenAI, convertStreamEvent, createErrorResponse } from './format/anthropic-to-openai.js';
import { logger } from './utils/logger.js';
import { config } from './config.js';

const app = express();

// Cache for models list
let modelsCache = {
    data: null,
    timestamp: 0
};

// Disable x-powered-by header for security
app.disable('x-powered-by');

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// API Key authentication middleware for /v1/* endpoints
app.use('/v1', (req, res, next) => {
    // Skip validation if apiKey is not configured
    if (!config.apiKey) {
        if (config.debug) logger.debug('[Auth] No API_KEY configured, skipping validation');
        return next();
    }

    const authHeader = req.headers['authorization'];
    const xApiKey = req.headers['x-api-key'];
    let providedKey = '';
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
        providedKey = authHeader.substring(7);
    } else if (xApiKey) {
        providedKey = xApiKey;
    }

    if (!providedKey || providedKey !== config.apiKey) {
        logger.warn(`[API] Unauthorized request from ${req.ip}, invalid API key (provided: ${providedKey ? '***' + providedKey.slice(-3) : 'none'})`);
        
        if (config.debug) {
            logger.debug(`[Auth] Comparison failed. Expected: ${config.apiKey}, Got: ${providedKey}`);
        }
        
        return res.status(401).json(createErrorResponse('Invalid or missing API key', 'authentication_error', 401));
    }

    next();
});

// Request logging middleware
app.use((req, res, next) => {
    const start = Date.now();

    res.on('finish', () => {
        const duration = Date.now() - start;
        const status = res.statusCode;
        const logMsg = `[${req.method}] ${req.path} ${status} (${duration}ms)`;

        if (status >= 500) {
            logger.error(logMsg);
        } else if (status >= 400) {
            logger.warn(logMsg);
        } else {
            logger.info(logMsg);
        }
    });

    next();
});

/**
 * Health check endpoint
 */
app.get('/health', async (req, res) => {
    try {
        // Try to ping the upstream proxy
        const upstreamHealth = await fetch(`${config.upstreamUrl}/health`);
        const upstreamStatus = await upstreamHealth.json();

        res.json({
            status: 'ok',
            adapter: 'antigravity-openai-adapter',
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            upstream: {
                url: config.upstreamUrl,
                status: upstreamStatus.status || 'unknown'
            }
        });
    } catch (error) {
        res.json({
            status: 'degraded',
            adapter: 'antigravity-openai-adapter',
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            upstream: {
                url: config.upstreamUrl,
                status: 'unreachable',
                error: error.message
            }
        });
    }
});

/**
 * List models endpoint - OpenAI compatible
 */
app.get('/v1/models', async (req, res) => {
    try {
        // Check cache first
        const now = Date.now();
        if (modelsCache.data && (now - modelsCache.timestamp < config.modelsCacheTtl)) {
            logger.debug('[API] Returning cached models list');
            return res.json(modelsCache.data);
        }

        // Fetch models from upstream
        const upstreamResponse = await fetch(`${config.upstreamUrl}/v1/models`, {
            headers: {
                'Authorization': `Bearer ${config.upstreamApiKey || 'test'}`,
                'Accept': 'application/json'
            }
        });

        if (!upstreamResponse.ok) {
            throw new Error(`Upstream error: ${upstreamResponse.status}`);
        }

        const anthropicModels = await upstreamResponse.json();

        // Convert to OpenAI format
        const openaiModels = {
            object: 'list',
            data: []
        };

        // Add the actual models from upstream
        if (anthropicModels.data) {
            for (const model of anthropicModels.data) {
                openaiModels.data.push({
                    id: model.id,
                    object: 'model',
                    created: Math.floor(now / 1000),
                    owned_by: 'antigravity'
                });
            }
        }

        // Update cache
        modelsCache = {
            data: openaiModels,
            timestamp: now
        };

        res.json(openaiModels);
    } catch (error) {
        logger.error('[API] Error listing models:', error);
        res.status(500).json(createErrorResponse(error.message, 'api_error', 500));
    }
});

/**
 * Chat Completions endpoint - Main OpenAI-compatible endpoint
 * POST /v1/chat/completions
 */
app.post('/v1/chat/completions', async (req, res) => {
    try {
        const openaiRequest = req.body;
        
        // Validate required fields
        if (!openaiRequest.messages || !Array.isArray(openaiRequest.messages)) {
            return res.status(400).json(createErrorResponse(
                'messages is required and must be an array',
                'invalid_request_error'
            ));
        }

        // Convert OpenAI request to Anthropic format
        const anthropicRequest = convertOpenAIToAnthropic(openaiRequest);
        
        logger.info(`[API] Request: model=${openaiRequest.model} -> ${anthropicRequest.model}, stream=${!!openaiRequest.stream}`);

        if (openaiRequest.stream) {
            // Handle streaming response
            await handleStreamingRequest(anthropicRequest, openaiRequest.model, res);
        } else {
            // Handle non-streaming response
            await handleNonStreamingRequest(anthropicRequest, openaiRequest.model, res);
        }

    } catch (error) {
        logger.error('[API] Error:', error);

        if (res.headersSent) {
            // If streaming already started, send error as SSE
            res.write(`data: ${JSON.stringify(createErrorResponse(error.message, 'api_error', 500))}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
        } else {
            res.status(500).json(createErrorResponse(error.message, 'api_error', 500));
        }
    }
});

/**
 * Handle non-streaming request
 */
async function handleNonStreamingRequest(anthropicRequest, requestModel, res) {
    const response = await fetch(`${config.upstreamUrl}/v1/messages`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.upstreamApiKey || 'test'}`,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(anthropicRequest)
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error?.message || `Upstream error: ${response.status}`;
        throw new Error(errorMessage);
    }

    const anthropicResponse = await response.json();

    // Check if it's an error response
    if (anthropicResponse.type === 'error') {
        return res.status(400).json(createErrorResponse(
            anthropicResponse.error?.message || 'Unknown error',
            anthropicResponse.error?.type || 'api_error'
        ));
    }

    // Convert to OpenAI format
    const openaiResponse = convertAnthropicToOpenAI(anthropicResponse, requestModel);
    res.json(openaiResponse);
}

/**
 * Handle streaming request
 */
async function handleStreamingRequest(anthropicRequest, requestModel, res) {
    // Set streaming headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Make streaming request to upstream
    const response = await fetch(`${config.upstreamUrl}/v1/messages`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.upstreamApiKey || 'test'}`,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(anthropicRequest)
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        res.write(`data: ${JSON.stringify(createErrorResponse(
            errorData.error?.message || `Upstream error: ${response.status}`,
            'api_error'
        ))}\n\n`);
        res.write('data: [DONE]\n\n');
        return res.end();
    }

    // Process SSE stream from upstream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const streamState = {};

    try {
        while (true) {
            const { done, value } = await reader.read();

            if (done) {
                break;
            }

            // Decode and handle characters correctly
            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;

            // Parse SSE events using a more robust approach
            let boundary;
            while ((boundary = buffer.indexOf('\n\n')) !== -1) {
                const eventBlock = buffer.substring(0, boundary);
                buffer = buffer.substring(boundary + 2);

                const lines = eventBlock.split('\n');
                let eventType = 'message';
                let data = '';

                for (const line of lines) {
                    if (line.startsWith('event:')) {
                        eventType = line.substring(6).trim();
                    } else if (line.startsWith('data:')) {
                        data = line.substring(5).trim();
                    }
                }

                if (data && data !== '[DONE]') {
                    try {
                        const anthropicEvent = JSON.parse(data);
                        const openaiEvents = convertStreamEvent(anthropicEvent, requestModel, streamState);

                        for (const event of openaiEvents) {
                            res.write(`data: ${JSON.stringify(event)}\n\n`);
                        }

                        if (anthropicEvent.type === 'message_stop') {
                            res.write('data: [DONE]\n\n');
                        }
                    } catch (parseError) {
                        logger.debug(`[Stream] Error parsing JSON data: ${parseError.message}`);
                    }
                }
            }
        }

        // Ensure [DONE] is sent if not already
        res.write('data: [DONE]\n\n');
        res.end();

    } catch (streamError) {
        logger.error('[Stream] Error:', streamError);
        res.write(`data: ${JSON.stringify(createErrorResponse(streamError.message, 'api_error'))}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
    }
}

/**
 * Embeddings endpoint (stub - not supported)
 */
app.post('/v1/embeddings', (req, res) => {
    res.status(501).json(createErrorResponse(
        'Embeddings are not supported by this adapter. Use a dedicated embeddings API.',
        'not_implemented'
    ));
});

/**
 * Completions endpoint (legacy - not supported)
 */
app.post('/v1/completions', (req, res) => {
    res.status(501).json(createErrorResponse(
        'Legacy completions API is not supported. Use /v1/chat/completions instead.',
        'not_implemented'
    ));
});

/**
 * Catch-all for other endpoints - proxy to upstream (WebUI, etc)
 */
app.use('/', createProxyMiddleware({
    target: config.upstreamUrl,
    changeOrigin: true,
    ws: true, // Support WebSockets if needed
    logLevel: config.debug ? 'debug' : 'error',
    onProxyReq: (proxyReq, req, res) => {
        // Log proxying in debug mode
        if (config.debug) {
            logger.debug(`[Proxy] Forwarding ${req.method} ${req.url} to upstream`);
        }
    },
    onError: (err, req, res) => {
        logger.error(`[Proxy] Error: ${err.message}`);
        if (!res.headersSent) {
            res.status(502).json(createErrorResponse('Upstream proxy unreachable', 'proxy_error', 502));
        }
    }
}));

export default app;