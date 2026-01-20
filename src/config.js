/**
 * Configuration management for antigravity-openai-adapter
 */

import { homedir } from 'os';
import { join } from 'path';
import { readFileSync, existsSync } from 'fs';

// Default configuration
const defaults = {
    // Server port
    port: 8081,

    // Upstream antigravity-claude-proxy URL
    upstreamUrl: 'http://localhost:8080',

    // API key for this adapter (optional)
    apiKey: null,

    // API key for upstream (usually'test' for antigravity-claude-proxy)
    upstreamApiKey: 'test',

    // Request timeout in milliseconds
    requestTimeout: 120000,

    // Cache TTL for models list in milliseconds (5 minutes)
    modelsCacheTtl: 5 * 60 * 1000,

    // Enable debug logging
    debug: false
};

/**
 * Load configuration from file or environment
 */
function loadConfig() {
    const config = { ...defaults };

    // Try to load config file
    const configPaths = [
        join(process.cwd(), 'config.json'),
        join(homedir(), '.config/antigravity-openai-adapter/config.json')
    ];

    for (const configPath of configPaths) {
        if (existsSync(configPath)) {
            try {
                const fileConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
                Object.assign(config, fileConfig);
                break;
            } catch (e) {
                console.warn(`[Config] Failed to load ${configPath}: ${e.message}`);
            }
        }
    }

    // Environment variables override file config
    if (process.env.PORT) {
        config.port = parseInt(process.env.PORT, 10);
    }
    if (process.env.UPSTREAM_URL) {
        config.upstreamUrl = process.env.UPSTREAM_URL;
    }
    if (process.env.ANTHROPIC_BASE_URL) {
        config.upstreamUrl = process.env.ANTHROPIC_BASE_URL;
    }
    if (process.env.API_KEY) {
        config.apiKey = process.env.API_KEY;
    }
    if (process.env.UPSTREAM_API_KEY) {
        config.upstreamApiKey = process.env.UPSTREAM_API_KEY;
    }
    if (process.env.ANTHROPIC_AUTH_TOKEN) {
        config.upstreamApiKey = process.env.ANTHROPIC_AUTH_TOKEN;
    }
    if (process.env.DEBUG === 'true') {
        config.debug = true;
    }

    // Command line arguments
    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--port' && args[i + 1]) {
            config.port = parseInt(args[i + 1], 10);
        } else if (args[i].startsWith('--port=')) {
            config.port = parseInt(args[i].split('=')[1], 10);
        } else if (args[i] === '--upstream' && args[i + 1]) {
            config.upstreamUrl = args[i + 1];
        } else if (args[i].startsWith('--upstream=')) {
            config.upstreamUrl = args[i].split('=')[1];
        } else if (args[i] === '--debug') {
            config.debug = true;
        }
    }

    return config;
}

export const config = loadConfig();
export default config;