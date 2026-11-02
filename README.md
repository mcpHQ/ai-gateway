# AI Gateway

An open-source AI gateway. Point an OpenAI SDK at one base URL, bring your own provider keys, and get ordered routing, fallbacks, exact-match caching, rate limits, monthly budgets, and request logs.

## Quick start

```bash
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000) and create the account. Only one account can be created. After that, use sign in. Then add a provider and create a gateway API key.

The Compose file starts Postgres and the Next.js app. The app applies database migrations on startup. Gateway state lives in the `aicost-postgres` volume.

### Local development

```bash
npm install
docker compose up postgres -d
npm run db:migrate
npm run dev
```

Copy [`.env.example`](.env.example) to `.env` and set `BETTER_AUTH_SECRET` and `ENCRYPTION_KEY` before storing provider keys.

## Call the gateway

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer $AI_GATEWAY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/gpt-4o-mini",
    "messages": [{ "role": "user", "content": "Hello" }]
  }'
```

A workspace can contain more than one gateway. Each gateway has its own keys, budgets, cache, threat detection, and request log. Provider credentials are shared by the workspace. The same key works for `/v1/responses`, `/v1/embeddings`, and `/v1/models`. Anthropic Messages is `POST /v1/messages`; the Anthropic SDK can send the gateway key in `x-api-key`. A request that falls back to the other provider is translated: Messages calls become chat completions, and Responses calls become Messages.

Model ids can be `openai/gpt-4o-mini`, `anthropic/claude-haiku-4-5`, `gemini/gemini-3.5-flash`, or a bare catalog id. Providers of the matching type are tried in ascending priority. A provider that lists the model is tried after those. Each provider is retried once on HTTP 429, HTTP 5xx, or a timeout. Any other 4xx stops the chain.

Optional controls:

- `x-ai-gateway-fallbacks`: comma-separated fallback models, or `gateway.fallbacks` in the JSON body
- `x-ai-gateway-cache-ttl`: cache successful non-streaming responses for at least 60 seconds, or set a workspace default
- `x-ai-gateway-cache-mode: semantic`: after an exact miss, embed the latest user message and reuse a stored response when cosine similarity is at least the workspace threshold (default 0.95). Tool calls and conversations longer than four messages skip this lookup
- `x-ai-gateway-prompt-cache: auto`: ask the provider to cache the prompt prefix. Anthropic requests get `cache_control` markers. OpenAI, Google, and DeepSeek already cache identical prefixes, so those bodies are left unchanged
- A workspace default fallback list is used when the request does not set one

The `gateway` object is removed before the provider call. Responses include `x-ai-gateway-provider`, `x-ai-gateway-model`, `x-ai-gateway-attempt`, and `x-ai-gateway-cache`.

Monthly budgets return `402`. A per-key requests-per-minute limit returns `429` with `Retry-After`. Cache hits cost nothing and do not call the provider.

Threat detection runs before the provider call. The workspace setting is flag, block, or off. Flag records the finding and continues. Block returns `403` and does not call the provider. The checks look for instruction-override text, common secret shapes, and payment card numbers. A flagged response includes `x-ai-gateway-guard: flag`.

## Tests

```bash
npm test
```
