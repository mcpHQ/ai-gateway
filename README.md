# AI Gateway

An open-source gateway for OpenAI-compatible clients. Point an SDK at one base URL, store your own provider keys, and the gateway routes each call, fails over, and records tokens, cost, and latency.

One installation has one account. A workspace can hold several gateways. Provider credentials belong to the workspace. Each gateway has its own API keys, budgets, cache, threat detection, and request log.

<p>
  <a href="https://render.com/deploy?repo=https://github.com/mcpHQ/ai-gateway" target="_blank" rel="noopener noreferrer"><img src="https://render.com/images/deploy-to-render-button.svg" alt="Deploy to Render" height="40"></a>
  <a href="https://railway.com/new/template?template=https%3A%2F%2Fgithub.com%2FmcpHQ%2Fai-gateway&plugins=postgresql&envs=DATABASE_URL%2CBETTER_AUTH_URL%2CBETTER_AUTH_SECRET%2CENCRYPTION_KEY&DATABASE_URLDefault=%24%7B%7B%20DATABASE_URL%20%7D%7D&DATABASE_URLDesc=Provided%20by%20Postgres.%20Leave%20this%20value.&BETTER_AUTH_URLDefault=https%3A%2F%2F%24%7B%7B%20RAILWAY_PUBLIC_DOMAIN%20%7D%7D&BETTER_AUTH_URLDesc=Public%20origin%20for%20sign-in.%20Leave%20the%20default.&BETTER_AUTH_SECRETDesc=A%20long%20random%20string.&ENCRYPTION_KEYDesc=64%20hex%20characters%20from%20openssl%20rand%20-hex%2032" target="_blank" rel="noopener noreferrer"><img src="https://railway.com/button.svg" alt="Deploy on Railway" height="40"></a>
  <a href="https://github.com/mcpHQ/ai-gateway/blob/main/docker-compose.coolify.yml" target="_blank" rel="noopener noreferrer"><img src="public/deploy-coolify.svg" alt="Deploy on Coolify" height="40"></a>
</p>

Render and Railway open a hosted app and Postgres from this repo. Coolify runs [`docker-compose.coolify.yml`](docker-compose.coolify.yml) on a server you control: New resource, Public repository `https://github.com/mcpHQ/ai-gateway`, Compose file `docker-compose.coolify.yml`. It fills the public URL, database password, auth secret, and encryption key.

![AI Gateway landing page](docs/landing.jpg)

## Features

- OpenAI chat completions, Responses, embeddings, and models, plus Anthropic Messages
- Ordered providers and fallbacks, with one retry on HTTP 429, HTTP 5xx, or a timeout
- Exact-match response cache, optional semantic cache, and provider prompt caching
- Monthly budgets and a per-key request rate limit
- Threat detection for instruction override, leaked secrets, and payment card numbers
- Dashboard for spend, request logs, providers, keys, and a cost calculator

## Install

### Docker Compose

Compose starts Postgres and the app, builds an image named `ai-gateway`, and keeps data in the `aicost-postgres` volume. The container applies migrations before it listens.

For a machine on localhost, run:

```bash
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000), create the account, add a provider, and create a gateway API key. Later visits use sign in.

To serve a public host, set the origin browsers will use. Put this in a `.env` file next to `docker-compose.yml`, then start the stack. Sign-in cookies are issued for that origin, so a proxy in front of port 3000 must serve the same URL.

```bash
BETTER_AUTH_URL=https://gateway.example.com
BETTER_AUTH_SECRET=replace-with-a-32-character-secret
ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef

docker compose up --build
```

`ENCRYPTION_KEY` is 64 hex characters. Changing it makes stored provider keys unreadable. Leave `BETTER_AUTH_URL` unset to keep `http://localhost:3000`.

### Kubernetes

Merging to `main` publishes `ghcr.io/mcphq/ai-gateway:main`. Publishing a GitHub release such as `v0.1.0` also publishes `0.1.0`, `0.1`, `0`, and moves `:latest`.

The chart starts Postgres unless you point it at a database you already run. It generates the auth secret, encryption key, and Postgres password on the first install and keeps them on upgrade. Migrations run when the container starts.

```bash
helm upgrade --install ai-gateway charts/ai-gateway \
  --set image.repository=ghcr.io/mcphq/ai-gateway \
  --set image.tag=main \
  --set auth.url=https://gateway.example.com
```

`auth.url` is the same setting as `BETTER_AUTH_URL`. It must be the origin browsers use.

Without an ingress, forward the service to that same host and port:

```bash
kubectl port-forward svc/ai-gateway 3000:80
```

Use an existing database:

```bash
helm upgrade --install ai-gateway charts/ai-gateway \
  --set postgres.enabled=false \
  --set database.url=postgres://user:pass@db.example:5432/aicost \
  --set auth.url=https://gateway.example.com \
  --set auth.secret="$(openssl rand -base64 32)" \
  --set encryptionKey="$(openssl rand -hex 32)"
```

More options, including ingress, are in [charts/ai-gateway/README.md](charts/ai-gateway/README.md).

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
