/**
 * Antigravity OpenAI Adapter
 * Entry point - starts the server
 */

import app from './server.js';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { spawn } from 'child_process';

const PORT = config.port;

/**
 * Start the upstream proxy automatically if configured
 */
function startProxy() {
    if (!config.autoStartProxy) return;

    // Check if upstream is localhost, if not, don't auto-start
    if (!config.upstreamUrl.includes('localhost') && !config.upstreamUrl.includes('127.0.0.1')) {
        logger.info('Upstream is not localhost, skipping auto-start of proxy');
        return;
    }

    logger.info('Starting antigravity-claude-proxy...');
    
    // Parse the port from upstreamUrl
    let proxyPort = 8080;
    try {
        const url = new URL(config.upstreamUrl);
        proxyPort = url.port || 8080;
    } catch (e) {
        // Fallback to 8080
    }

    const proxy = spawn('npx', ['antigravity-claude-proxy@latest', 'start', `--port=${proxyPort}`], {
        stdio: 'inherit',
        shell: true,
        env: {
            ...process.env,
            PORT: proxyPort // Ensure the proxy uses the correct port via ENV too
        }
    });

    proxy.on('error', (err) => {
        logger.error(`Failed to start proxy: ${err.message}`);
    });

    proxy.on('exit', (code) => {
        if (code !== 0 && code !== null) {
            logger.error(`Proxy exited with code ${code}`);
        }
    });

    // Handle proxy shutdown when adapter shuts down
    process.on('SIGINT', () => proxy.kill());
    process.on('SIGTERM', () => proxy.kill());
}

// Start server
app.listen(PORT, () => {
    console.log('');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║                                                              ║');
    console.log('║   🚀 Antigravity OpenAI Adapter                              ║');
    console.log('║                                                              ║');
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log(`║   OpenAI API:http://localhost:${PORT}                ║`);
    console.log(`║   Upstream:${config.upstreamUrl.padEnd(42)}║`);
    console.log('║                                                              ║');
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log('║Endpoints:                                                 ║');
    console.log('║   • POST /v1/chat/completions(Chat Completions)           ║');
    console.log('║   • GET/v1/models             (List Models)                ║');
    console.log('║   • GET  /health                (Health Check)               ║');
    console.log('║                                              ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('');
    logger.success(`Server running on port ${PORT}`);
    logger.info(`Forwarding to: ${config.upstreamUrl}`);

    if (config.debug) {
        logger.info('Debug mode: enabled');
    }

    // Auto-start proxy if needed
    startProxy();
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    logger.info('Shutting down...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    logger.info('Shutting down...');
    process.exit(0);
});