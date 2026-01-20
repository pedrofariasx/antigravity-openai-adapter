#!/usr/bin/env node

/**
 * Antigravity OpenAI Adapter CLI
 */

const args = process.argv.slice(2);
const command = args[0];

function showHelp() {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                Antigravity OpenAI Adapter║
╚══════════════════════════════════════════════════════════════╝

Usage: antigravity-openai-adapter <command> [options]

Commands:
  startStart the adapter server

Options:
  --port=<port>        Port to listen on (default: 8081)
  --upstream=<url>     Upstream antigravity-claude-proxy URL
                (default: http://localhost:8080)
  --debug              Enable debug logging
  --help, -h           Show this help message

Environment Variables:
  PORT Server port
  UPSTREAM_URL         Upstream proxy URL
  ANTHROPIC_BASE_URL   Alternative to UPSTREAM_URL
  API_KEY              API key for this adapter (optional)
  UPSTREAM_API_KEY     API key for upstream proxy
  ANTHROPIC_AUTH_TOKEN Alternative to UPSTREAM_API_KEY
  DEBUG=true           Enable debug mode

Examples:
  # Start with default settings
  antigravity-openai-adapter start

  # Start on custom port
  antigravity-openai-adapter start --port=3000

  # Start with custom upstream
  antigravity-openai-adapter start --upstream=http://localhost:9000

  # Using npx
  npx antigravity-openai-adapter start
`);
}

async function main() {
    if (!command || command === '--help' || command === '-h') {
        showHelp();
        process.exit(0);
    }

    if (command === 'start') {
        // Import and start the server
        await import('../src/index.js');
    } else {
        console.error(`Unknown command: ${command}`);
        showHelp();
        process.exit(1);
    }
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});