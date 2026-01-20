/**
 * OpenAI to Anthropic Request Converter
 * Converts OpenAI Chat Completions API requests to Anthropic Messages API format
 */

import { logger } from '../utils/logger.js';

/**
 * Convert OpenAI messages format to Anthropic messages format
 * @param {Array} openaiMessages - OpenAI format messages
 * @returns {{ system: string|null, messages: Array }} - Anthropic format with system extracted
 */
function convertMessages(openaiMessages) {
    let system = null;
    const messages = [];

    for (const msg of openaiMessages) {
        // Extract system message (OpenAI puts it in messages array)
        if (msg.role === 'system') {
            // Anthropic supports string or array of text blocks for system
            if (typeof msg.content === 'string') {
                system = system ? `${system}\n\n${msg.content}` : msg.content;
            } else if (Array.isArray(msg.content)) {
                const text = msg.content
                    .filter(part => part.type === 'text')
                    .map(part => part.text)
                    .join('\n');
                system = system ? `${system}\n\n${text}` : text;
            }
            continue;
        }

        // Convert user messages
        if (msg.role === 'user') {
            const content = convertUserContent(msg.content);
            messages.push({
                role: 'user',
                content
            });
            continue;
        }

        // Convert assistant messages
        if (msg.role === 'assistant') {
            const content = convertAssistantContent(msg);
            messages.push({
                role: 'assistant',
                content
            });
            continue;
        }

        // Convert tool responses
        if (msg.role === 'tool') {
            // OpenAI tool response maps to Anthropic tool_result
            const toolResult = {
                type: 'tool_result',
                tool_use_id: msg.tool_call_id,
                content: typeof msg.content === 'string'
                    ? msg.content 
                    : JSON.stringify(msg.content)
            };

            // Check if the last message is from user (can append to it)
            const lastMsg = messages[messages.length - 1];
            if (lastMsg && lastMsg.role === 'user') {
                if (typeof lastMsg.content === 'string') {
                    lastMsg.content = [{ type: 'text', text: lastMsg.content }, toolResult];
                } else if (Array.isArray(lastMsg.content)) {
                    lastMsg.content.push(toolResult);
                }
            } else {
                // Anthropic requires tool_result to be in a user message
                messages.push({
                    role: 'user',
                    content: [toolResult]
                });
            }
            continue;
        }

        // Function role (legacy OpenAI format)
        if (msg.role === 'function') {
            const toolResult = {
                type: 'tool_result',
                tool_use_id: msg.name, // Legacy format uses name as id
                content: typeof msg.content === 'string' 
                    ? msg.content 
                    : JSON.stringify(msg.content)
            };

            const lastMsg = messages[messages.length - 1];
            if (lastMsg && lastMsg.role === 'user') {
                if (typeof lastMsg.content === 'string') {
                    lastMsg.content = [{ type: 'text', text: lastMsg.content }, toolResult];
                } else if (Array.isArray(lastMsg.content)) {
                    lastMsg.content.push(toolResult);
                }
            } else {
                messages.push({
                    role: 'user',
                    content: [toolResult]
                });
            }
            continue;
        }
    }

    return { system, messages };
}

/**
 * Convert user content from OpenAI to Anthropic format
 * @param {string|Array} content - OpenAI user content
 * @returns {string|Array} - Anthropic format content
 */
function convertUserContent(content) {
    if (typeof content === 'string') {
        return content;
    }

    if (Array.isArray(content)) {
        return content.map(part => {
            if (part.type === 'text') {
                return { type: 'text', text: part.text };
            }
            if (part.type === 'image_url') {
                // Convert OpenAI image format to Anthropic
                const imageUrl = part.image_url?.url || '';
                // Check if it's a base64 data URI
                const base64Match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
                if (base64Match) {
                    return {
                        type: 'image',
                        source: {
                            type: 'base64',
                            media_type: base64Match[1],
                            data: base64Match[2]
                        }
                    };
                }

                // URL-based image
                return {
                    type: 'image',
                    source: {
                        type: 'url',
                        url: imageUrl
                    }
                };
            }
            // Pass through unknown types
            return part;
        });
    }

    return content;
}

/**
 * Convert assistant content from OpenAI to Anthropic format
 * @param {Object} msg - OpenAI assistant message
 * @returns {string|Array} - Anthropic format content
 */
function convertAssistantContent(msg) {
    const content = [];

    // Handle text content
    if (msg.content) {
        if (typeof msg.content === 'string') {
            content.push({ type: 'text', text: msg.content });
        } else if (Array.isArray(msg.content)) {
            for (const part of msg.content) {
                if (part.type === 'text') {
                    content.push({ type: 'text', text: part.text });
                }}
        }
    }

    // Handle tool calls (OpenAI) -> tool_use (Anthropic)
    if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
        for (const toolCall of msg.tool_calls) {
            let args = {};
            try {
                args = typeof toolCall.function.arguments === 'string'
                    ? JSON.parse(toolCall.function.arguments)
                    : toolCall.function.arguments || {};
            } catch (e) {
                logger.warn(`[OpenAI→Anthropic] Failed to parse tool arguments: ${e.message}`);
                args = { raw: toolCall.function.arguments };
            }

            content.push({
                type: 'tool_use',
                id: toolCall.id,
                name: toolCall.function.name,
                input: args
            });
        }
    }

    // Handle legacy function_call format
    if (msg.function_call) {
        let args = {};
        try {
            args = typeof msg.function_call.arguments === 'string'
                ? JSON.parse(msg.function_call.arguments)
                : msg.function_call.arguments || {};
        } catch (e) {
            logger.warn(`[OpenAI→Anthropic] Failed to parse function arguments: ${e.message}`);
            args = { raw: msg.function_call.arguments };
        }

        content.push({
            type: 'tool_use',
            id: `call_${Date.now()}`,
            name: msg.function_call.name,
            input: args
        });
    }

    // If only one text block, return as string for simplicity
    if (content.length === 1 && content[0].type === 'text') {
        return content[0].text;
    }

    return content.length > 0 ? content : '';
}

/**
 * Convert OpenAI tools format to Anthropic format
 * @param {Array} openaiTools - OpenAI tools definition
 * @returns {Array} - Anthropic tools definition
 */
function convertTools(openaiTools) {
    if (!openaiTools || !Array.isArray(openaiTools)) {
        return undefined;
    }

    return openaiTools.map(tool => {
        if (tool.type === 'function') {
            return {
                name: tool.function.name,
                description: tool.function.description || '',
                input_schema: tool.function.parameters || { type: 'object' }
            };
        }
        // Direct function format (legacy)
        if (tool.name) {
            return {
                name: tool.name,
                description: tool.description || '',
                input_schema: tool.parameters || { type: 'object' }
            };
        }
        return tool;
    });
}

/**
 * Convert OpenAI tool_choice to Anthropic format
 * @param {string|Object} openaiToolChoice - OpenAI tool choice
 * @returns {Object|undefined} - Anthropic tool choice
 */
function convertToolChoice(openaiToolChoice) {
    if (!openaiToolChoice) {
        return undefined;
    }

    // String formats
    if (typeof openaiToolChoice === 'string') {
        switch (openaiToolChoice) {
            case 'none':
                return { type: 'none' };
            case 'auto':
                return { type: 'auto' };
            case 'required':
                return { type: 'any' };
            default:
                return { type: 'auto' };
        }
    }

    // Object format: { type: "function", function: { name: "..." } }
    if (openaiToolChoice.type === 'function' && openaiToolChoice.function?.name) {
        return {
            type: 'tool',
            name: openaiToolChoice.function.name
        };
    }

    return { type: 'auto' };
}

/**
 * Map OpenAI model names to Anthropic/Antigravity model names
 * @param {string} openaiModel - OpenAI model name
 * @returns {string} - Anthropic/Antigravity model name
 */
function mapModel(openaiModel) {
    // No mapping - use the model ID directly from the request as requested by user
    return openaiModel;
}

/**
 * Convert OpenAI Chat Completions request to Anthropic Messages request
 * @param {Object} openaiRequest - OpenAI Chat Completions format request
 * @returns {Object} - Anthropic Messages format request
 */
export function convertOpenAIToAnthropic(openaiRequest) {
    const {
        model,
        messages,
        max_tokens,
        max_completion_tokens,
        temperature,
        top_p,
        stream,
        tools,
        tool_choice,
        response_format,
        stop,
        // OpenAI-specific params we'll ignore
        frequency_penalty,
        presence_penalty,
        logprobs,
        n,
        seed,
        user
    } = openaiRequest;

    // Convert messages and extract system
    const { system, messages: anthropicMessages } = convertMessages(messages || []);

    // Build Anthropic request
    const anthropicRequest = {
        model: mapModel(model || 'gpt-4'),
        messages: anthropicMessages,
        max_tokens: max_completion_tokens || max_tokens || 4096,
        stream: stream || false
    };

    // Add system if present
    if (system) {
        anthropicRequest.system = system;
    }

    // Add temperature (Anthropic range is 0-1, same as OpenAI)
    if (temperature !== undefined) {
        anthropicRequest.temperature = Math.max(0, Math.min(1, temperature));
    }

    // Add top_p
    if (top_p !== undefined) {
        anthropicRequest.top_p = top_p;
    }

    // Convert tools
    const anthropicTools = convertTools(tools);
    if (anthropicTools && anthropicTools.length > 0) {
        anthropicRequest.tools = anthropicTools;
    }

    // Convert tool_choice
    const anthropicToolChoice = convertToolChoice(tool_choice);
    if (anthropicToolChoice) {
        anthropicRequest.tool_choice = anthropicToolChoice;
    }

    // Handle stop sequences
    if (stop) {
        anthropicRequest.stop_sequences = Array.isArray(stop) ? stop : [stop];
    }

    // Enable thinking for thinking-capable models
    if (anthropicRequest.model.includes('thinking')) {
        anthropicRequest.thinking = {
            type: 'enabled',
            budget_tokens: Math.min(16000, Math.floor((anthropicRequest.max_tokens || 4096) * 0.5))
        };
    }

    logger.debug(`[OpenAI→Anthropic] Converted request for model: ${model} -> ${anthropicRequest.model}`);

    return anthropicRequest;
}

export default {
    convertOpenAIToAnthropic,
    mapModel,
    convertMessages,
    convertTools,
    convertToolChoice
};