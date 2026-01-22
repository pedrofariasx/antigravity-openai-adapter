# AGO Adapter (Antigravity OpenAI Adapter)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An adapter that exposes an **OpenAI-compatible API** to communicate with **antigravity-claude-proxy**. This allows using applications that expect the OpenAI API with Claude and Gemini models available through Antigravity.

## How it Works

```
┌──────────────────┐     ┌─────────────────────┐     ┌────────────────────────────┐
│  OpenAI-enabled  │────▶│  This Adapter       │────▶│  antigravity-claude-proxy  │
│  Application     │     │  (OpenAI → Anthropic│     │  (Anthropic → Google       │
│  (Chat API)      │     │   format)           │     │   Generative AI)           │
└──────────────────┘     └─────────────────────┘     └────────────────────────────┘
```

1. Receives requests in **OpenAI Chat Completions API** format.
2. Converts to **Anthropic Messages API** format.
3. Forwards to **antigravity-claude-proxy**.
4. Converts responses back to **OpenAI** format.
5. Supports full **streaming** (SSE).
6. **Automatic Proxy Management**: Can automatically start the upstream proxy if it's running on localhost.
7. **Transparent Routing**: Unknown routes (like WebUI) are automatically proxied to the upstream.

## Prerequisites

- **Node.js** 18 or higher
- **antigravity-claude-proxy** (automatically handled if on localhost, otherwise needs to be running)

---

## Installation

### Option 1: npm / npx

```bash
# Run directly with npx (automatic proxy start)
npx @pedrofariasx/antigravity-openai-adapter start

# Or install globally
npm install -g @pedrofariasx/antigravity-openai-adapter
antigravity-openai-adapter start
```

### Option 2: Docker

```bash
# Using Docker Compose
docker-compose up -d

# Using Docker Stack (Swarm)
docker stack deploy -c docker-stack.yml antigravity
```

### Option 3: Clone Repository

```bash
git clone https://github.com/pedrofariasx/antigravity-openai-adapter
cd antigravity-openai-adapter
npm install
npm start
```

---

## Quick Start

### 1. Start the Adapter

```bash
npx @pedrofariasx/antigravity-openai-adapter start
```

By default, the adapter will:
1. Start on `http://localhost:8081`.
2. Check if `antigravity-claude-proxy` is needed.
3. Automatically run `npx antigravity-claude-proxy@latest start` if the upstream is configured to `localhost`.
4. Proxy all non-API requests (like the WebUI) to the upstream proxy.

### 2. Use with OpenAI Applications

Configure your application to use:

```
Base URL: http://localhost:8081/v1
API Key: any-value (or your configured API_KEY)
```

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-----------|
| `/v1/chat/completions` | POST | Chat Completions (main) |
| `/v1/models` | GET | List available models |
| `/health` | GET | Health Check |
| `/*` | * | Proxied to antigravity-claude-proxy (WebUI, etc) |

---

## Configuration

The adapter supports configuration via `config.json`, environment variables, or CLI arguments. It also supports `.env` files.

### Environment Variables

| Variable | Description | Default |
|----------|-----------|--------|
| `PORT` | Server port | `8081` |
| `UPSTREAM_URL` | antigravity-claude-proxy URL | `http://localhost:8080` |
| `API_KEY` | API Key for this adapter | - |
| `UPSTREAM_API_KEY` | API Key for upstream proxy | `test` |
| `AUTO_START_PROXY` | Auto-start proxy via npx | `true` |
| `DEBUG` | Enable debug logging | `false` |

### CLI Arguments

```bash
antigravity-openai-adapter start --port=3000 --upstream=http://localhost:9000 --no-proxy --debug
```

*   `--no-proxy`: Disables automatic starting of the upstream proxy.

---

## Features Supported

### ✅ Supported

- Chat Completions API
- Streaming (SSE)
- System messages
- Multi-turn conversations
- Tool/Function calling
- Vision (Images)
- Temperature, top_p, max_tokens, stop sequences
- Unified routing for API and WebUI

### ❌ Not Supported

- Embeddings (`/v1/embeddings`)
- Legacy Completions (`/v1/completions`)
- Assistants API, Files API, Fine-tuning

---

## Development

```bash
# Clone and install
git clone https://github.com/pedrofariasx/antigravity-openai-adapter
cd antigravity-openai-adapter
npm install

# Run in development mode (with watch)
npm run dev

# Run tests
npm test
```

---

## License

MIT
