# AI Gateway

An open-source gateway for OpenAI-compatible clients. Point an SDK at one base URL, store your own provider keys, and the gateway routes each call, fails over, and records tokens, cost, and latency.

One installation has one account. A workspace can hold several gateways. Provider credentials belong to the workspace. Each gateway has its own API keys, budgets, cache, threat detection, and request log.

![AI Gateway landing page](docs/landing.jpg)

## Features

- OpenAI chat completions, Responses, embeddings, and models, plus Anthropic Messages
- Ordered providers and fallbacks, with one retry on HTTP 429, HTTP 5xx, or a timeout
- Exact-match response cache, optional semantic cache, and provider prompt caching
- Monthly budgets and a per-key request rate limit
- Threat detection for instruction override, leaked secrets, and payment card numbers
- Dashboard for spend, request logs, providers, keys, and a cost calculator

## Quick start

```bash
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000) and create the account. Later visits use sign in. Add a provider, then create a gateway API key.

Compose starts Postgres and the app. The container applies database migrations before it listens. Data stays in the `aicost-postgres` volume. The local image is named `ai-gateway`.

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

| Endpoint | Client |
| --- | --- |
| `POST /v1/chat/completions` | OpenAI chat |
| `POST /v1/responses` | OpenAI Responses |
| `POST /v1/embeddings` | OpenAI embeddings |
| `GET /v1/models` | Model list |
| `POST /v1/messages` | Anthropic Messages (`x-api-key` or a bearer token) |

The same gateway key works for every endpoint. A fallback that crosses providers is translated: Messages become chat completions, and Responses become Messages.

Model ids can be `openai/gpt-4o-mini`, `anthropic/claude-haiku-4-5`, `gemini/gemini-3.5-flash`, or a bare catalog id. Providers of the matching type are tried in ascending priority. A provider that lists the model is tried after those. Any other HTTP 4xx stops the chain.

### Request controls

Send these as headers, or as a `gateway` object in the JSON body. That object is removed before the provider call.

| Control | Effect |
| --- | --- |
| `x-ai-gateway-fallbacks` | Comma-separated fallback models. The gateway default is used when the request sets none. |
| `x-ai-gateway-cache-ttl` | Cache a successful non-streaming response. Minimum 60 seconds. |
| `x-ai-gateway-cache-mode: semantic` | After an exact miss, reuse a stored response when cosine similarity is at least the gateway threshold (default 0.95). Tool calls and conversations longer than four messages skip this lookup. |
| `x-ai-gateway-prompt-cache: auto` | Ask the provider to cache the prompt prefix. Anthropic requests get `cache_control` markers. OpenAI, Google, and DeepSeek bodies are left unchanged. |

Responses include `x-ai-gateway-provider`, `x-ai-gateway-model`, `x-ai-gateway-attempt`, and `x-ai-gateway-cache`.

A monthly budget returns `402`. A per-key requests-per-minute limit returns `429` with `Retry-After`. Cache hits are not billed and do not call a provider.

### Threat detection

Each gateway is set to **flag**, **block**, or **off**. The check runs before the cache lookup and the provider call.

- **Flag** records the finding and continues. The response includes `x-ai-gateway-guard: flag`.
- **Block** returns `403` and does not call a provider.
- **Off** skips the check.

The check looks for instruction-override phrasing, payment card numbers, and secrets matched by [secretlint](https://github.com/secretlint/secretlint)'s recommended rules. Only the finding code is stored, not the matched secret.

## Kubernetes

Merging to `main` publishes `ghcr.io/mcphq/ai-gateway:main`. Publishing a GitHub release such as `v0.1.0` also publishes `0.1.0`, `0.1`, `0`, and moves `:latest`.

```bash
helm upgrade --install ai-gateway charts/ai-gateway \
  --set image.repository=ghcr.io/mcphq/ai-gateway \
  --set image.tag=main \
  --set auth.url=http://localhost:3000
kubectl port-forward svc/ai-gateway 3000:80
```

`auth.url` must be the origin browsers use, or sign-in cookies will not match. The chart can start Postgres, or use a database you already run. Migrations run when the container starts. Chart options are in [charts/ai-gateway/README.md](charts/ai-gateway/README.md).

## Local development

```bash
npm install
docker compose up postgres -d
cp .env.example .env
npm run db:migrate
npm run dev
```

Set `BETTER_AUTH_SECRET` and `ENCRYPTION_KEY` in `.env` before storing provider keys. `ENCRYPTION_KEY` is 64 hex characters. Changing it makes stored provider keys unreadable.

```bash
npm test
```

## License

[Apache-2.0](LICENSE)
