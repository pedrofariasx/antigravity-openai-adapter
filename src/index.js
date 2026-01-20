/**
 * Antigravity OpenAI Adapter
 * Entry point - starts the server
 */

import app from './server.js';
import { config } from './config.js';
import { logger } from './utils/logger.js';

const PORT = config.port;

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