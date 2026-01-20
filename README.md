# Antigravity OpenAI Adapter

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Um adaptador que expõe uma **API compatível com OpenAI** para se comunicar com o **antigravity-claude-proxy**. Isso permite usar aplicações que esperam a API OpenAI com os modelos Claude e Gemini disponíveis atravésdo Antigravity.

## Como Funciona

```
┌──────────────────┐     ┌─────────────────────┐     ┌────────────────────────────┐
│  Aplicação com   │────▶│  Este Adaptador     │────▶│  antigravity-claude-proxy  │
│  API OpenAI      │     │  (OpenAI → Anthropic│     │  (Anthropic → Google│
│  (Chat API)      │     │   format)           │     │   Generative AI)           │
└──────────────────┘     └─────────────────────┘     └────────────────────────────┘
```

1. Recebe requisições no formato **OpenAI Chat Completions API**
2. Converte para formato **Anthropic Messages API**
3. Encaminha para o **antigravity-claude-proxy**
4. Converte as respostas de volta para formato **OpenAI**
5. Suporta **streaming** (SSE) completo

## Pré-requisitos

- **Node.js** 18 ou superior
- **antigravity-claude-proxy** rodando (padrão: http://localhost:8080)

---

## Instalação

### Opção 1: npm / npx

```bash
# Executar diretamente com npx (sem instalação)
npx @pedrofariasx/antigravity-openai-adapter start

# Ou instalar globalmente
npm install -g @pedrofariasx/antigravity-openai-adapter
antigravity-openai-adapter start
```

### Opção 2: Docker

```bash
# Usando Docker Compose
docker-compose up -d

# Ou build direto
docker build -t antigravity-openai-adapter .
docker run -p 8081:8081 antigravity-openai-adapter
```

### Opção 2: Clonar Repositório

```bash
git clone <repository-url>
cd antigravity-openai-adapter
npm install
npm start
```

---

## Início Rápido

### 1. Iniciar o antigravity-claude-proxy

Primeiro, certifique-se que o antigravity-claude-proxy está rodando:

```bash
npx antigravity-claude-proxy start
# Roda em http://localhost:8080
```

### 2. Iniciar o Adaptador OpenAI

```bash
antigravity-openai-adapter start
# Roda em http://localhost:8081
```

### 3. Usar com aplicações OpenAI

Configure sua aplicação para usar:

```
Base URL: http://localhost:8081/v1
API Key: qualquer-valor (ou configure uma chave específica)
```

---

## Endpoints da API

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/v1/chat/completions` | POST | Chat Completions (principal) |
| `/v1/models` | GET | Listar modelos disponíveis |
| `/health` | GET | Verificação de saúde |

### Exemplo de Requisição

```bash
curl http://localhost:8081/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test" \
  -d '{
    "model": "gpt-4",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'
```

### Exemplo com Streaming

```bash
curl http://localhost:8081/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test" \
  -d '{
    "model": "gpt-4",
    "messages": [
      {"role": "user", "content": "Escreva um poema curto"}
    ],
    "stream": true
  }'
```

---

## Modelos Disponíveis

O adaptador não faz mapeamento automático de modelos. Os modelos disponíveis são exatamente os mesmos fornecidos pelo `antigravity-claude-proxy`.

Para ver a lista de modelos suportados, acesse o endpoint `/v1/models` ou verifique a documentação do proxy original.

Modelos comuns incluem:
- `claude-opus-4-5-thinking`
- `claude-sonnet-4-5-thinking`
- `claude-sonnet-4-5`
- `gemini-3-pro-high`
- `gemini-3-flash`

---

## Configuração

### Variáveis de Ambiente

| Variável | Descrição | Padrão |
|----------|-----------|--------|
| `PORT` | Porta do servidor | `8081` |
| `UPSTREAM_URL` | URL do antigravity-claude-proxy | `http://localhost:8080` |
| `ANTHROPIC_BASE_URL` | Alternativa ao UPSTREAM_URL | - |
| `API_KEY` | Chave API para este adaptador | - |
| `UPSTREAM_API_KEY` | Chave API para o upstream | `test` |
| `ANTHROPIC_AUTH_TOKEN` | Alternativa ao UPSTREAM_API_KEY | - |
| `DEBUG` | Habilitar logs de debug | `false` |

### Argumentos CLI

```bash
antigravity-openai-adapter start --port=3000 --upstream=http://localhost:9000 --debug
```

### Arquivo de Configuração

Crie `config.json` no diretório atual ou em `~/.config/antigravity-openai-adapter/config.json`:

```json
{
  "port": 8081,
  "upstreamUrl": "http://localhost:8080",
  "apiKey": null,
  "upstreamApiKey": "test",
  "debug": false
}
```

---

## Uso com Bibliotecas OpenAI

### Python (openai)

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:8081/v1",
    api_key="test"
)

response = client.chat.completions.create(
    model="gpt-4",
    messages=[
        {"role": "user", "content": "Hello!"}
    ]
)

print(response.choices[0].message.content)
```

### Node.js (openai)

```javascript
import OpenAI from 'openai';

const client = new OpenAI({
    baseURL: 'http://localhost:8081/v1',
    apiKey: 'test'
});

const response = await client.chat.completions.create({
    model: 'gpt-4',
    messages: [
        { role: 'user', content: 'Hello!' }
    ]
});

console.log(response.choices[0].message.content);
```

### cURL

```bash
curl http://localhost:8081/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

---

## Recursos Suportados

### ✅ Suportado

- Chat Completions API
- Streaming (SSE)
- System messages
- Multi-turn conversations
- Tool/Function calling
- Vision (imagens)
- Temperature, top_p, max_tokens
- Stop sequences

### ❌ Não Suportado

- Embeddings (`/v1/embeddings`)
- Legacy Completions (`/v1/completions`)
- Audio/Speech APIs
- Fine-tuning
- Assistants API
- Files API

---

## Arquitetura

```
antigravity-openai-adapter/
├── src/
│   ├── index.js              # Entry point
│   ├── server.js             # Express server
│   ├── config.js             # Configuration
│   ├── format/
│   │   ├── openai-to-anthropic.js   # Request converter
│   │   └── anthropic-to-openai.js   # Response converter
│   └── utils/
│       └── logger.js         # Logging utility
├── bin/
│   └── cli.js                # CLI entry point
├── package.json
└── README.md
```

---

## Troubleshooting

### Erro de conexão com upstream

```
upstream: { status: 'unreachable' }
```

Verifique se o antigravity-claude-proxy está rodando:
```bash
curl http://localhost:8080/health
```

### Erro 401Unauthorized

Configure a chave API correta:
```bash
UPSTREAM_API_KEY=sua-chave antigravity-openai-adapter start
```

### Modelo não encontrado

Certifique-se de que está usando um ID de modelo válido que o `antigravity-claude-proxy` suporta.

---

## Desenvolvimento

```bash
# Clone o repositório
git clone <repository-url>
cd antigravity-openai-adapter

# Instalar dependências
npm install

# Rodar em modo desenvolvimento (com watch)
npm run dev

# Rodar testes
npm test
```

---

## Licença

MIT

---

## Relacionados

- [antigravity-claude-proxy](https://github.com/badri-s2001/antigravity-claude-proxy) - Proxy principal Anthropic → Google Cloud Code