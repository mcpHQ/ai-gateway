import { calculateCostMicros, type PriceOverride } from "@/lib/cost/catalog";
import { responseCacheKey, resolveCacheTtl } from "@/lib/llm/cache";
import { assertBudgets } from "@/lib/llm/limits";
import { beginGuard, collectText, markGuard, normalizeGuardAction } from "@/lib/llm/guard";
import { applyAnthropicPromptCache, resolvePromptCaching } from "@/lib/llm/prompt-cache";
import { matchSemanticCache, resolveCacheMode, resolveSimilarity, semanticParamsHash, semanticQueryText, type SemanticLookup } from "@/lib/llm/semantic";
import { isRetryableStatus, planAttempts, resolveFallbackModels, resolveRequestCacheTtl, withoutGateway } from "@/lib/llm/route";
import {
  ProxyError,
  type AttemptRecord,
  type CachedPayload,
  type GatewayKey,
  type PlannedAttempt,
  type RequestLog,
  type RoutedProvider,
  type UsageCounts,
} from "@/lib/llm/types";
import {
  anthropicSseToOpenAI,
  anthropicToOpenAIResponse,
  anthropicUsageFromSse,
  estimatePromptTokens,
  toAnthropicMessages,
  toAnthropicTools,
  type ChatCompletionRequest,
  type Usage,
} from "@/lib/llm/anthropic";
import { ANTHROPIC_BASE, defaultProviderBase } from "@/lib/llm/providers";
import { cachedInputTokens, usageFromOpenAIStream } from "@/lib/llm/stream-usage";

const UPSTREAM_TIMEOUT_MS = 60_000;

type HandleDeps = {
  fetchImpl: typeof fetch;
  consumeRateLimit: () => Promise<void>;
  readCache: (cacheKey: string) => Promise<CachedPayload | null>;
  writeCache: (cacheKey: string, payload: CachedPayload, ttlSeconds: number) => Promise<void>;
  record: (row: RequestLog) => Promise<void>;
  embedText?: (text: string) => Promise<number[] | { embedding: number[] | null; costMicros: number } | null>;
  readSemantic?: (lookup: SemanticLookup) => Promise<{ payload: CachedPayload; similarity: number } | null>;
  writeSemantic?: (input: SemanticLookup & { payload: CachedPayload; ttlSeconds: number }) => Promise<void>;
};

type ChatSuccess =
  | { ok: true; kind: "json"; json: unknown; usage: UsageCounts }
  | { ok: true; kind: "stream"; stream: ReadableStream<Uint8Array>; contentType: string; persist: Promise<UsageCounts> }
  | { ok: false; status: number; error: string; retryable: boolean; body?: unknown };

export async function handleChat(
  input: HandleDeps & {
    key: GatewayKey;
    request: ChatCompletionRequest;
    fallbackHeader: string | null;
    cacheTtlHeader: string | null;
    promptCacheHeader?: string | null;
    cacheModeHeader?: string | null;
    similarityHeader?: string | null;
    providers: RoutedProvider[];
    overrides: PriceOverride[];
  },
) {
  const started = Date.now();
  assertBudgets(input.key);
  await input.consumeRateLimit();

  const gateway = input.request.gateway;
  const request = withoutGateway(input.request) as ChatCompletionRequest;
  const stream = Boolean(request.stream);
  const estimatedPrompt = estimatePromptTokens(request.messages || []);
  const fallbacks = resolveFallbackModels(input.fallbackHeader, gateway, input.key.fallbacks);
  const ttl = resolveCacheTtl(resolveRequestCacheTtl(input.cacheTtlHeader, gateway), input.key.cacheTtlSeconds);
  const promptCaching = resolvePromptCaching(input.promptCacheHeader ?? null, gateway) === "auto";
  const cacheMode = resolveCacheMode(input.cacheModeHeader ?? null, gateway, input.key.cacheMode);
  const similarity = resolveSimilarity(input.similarityHeader ?? null, gateway, input.key.similarityThreshold);
  const attempts = planAttempts(input.providers, request.model, fallbacks);
  if (attempts.length === 0) {
    throw new ProxyError(400, `No provider configured for model ${request.model}`);
  }
  const guard = await beginGuard({
    action: normalizeGuardAction(input.key.guardAction),
    text: collectText(request.messages),
    record: input.record,
    blockedRow: () =>
      logRow(input.key, {
        providerId: attempts[0].provider.id,
        providerType: attempts[0].provider.type,
        model: attempts[0].nativeModel,
        promptTokens: estimatedPrompt,
        completionTokens: 0,
        costMicros: 0,
        usageSource: "estimated",
        status: 403,
        durationMs: Date.now() - started,
        streamed: stream,
        cacheHit: false,
        cacheKind: "miss",
        attempts: [],
        error: "Request blocked by threat detection",
      }),
  });
  input.record = guard.record;

  const cacheKey = responseCacheKey({
    organizationId: input.key.organizationId,
    apiKeyId: input.key.id,
    endpoint: "chat.completions",
    providerType: attempts[0].provider.type,
    model: attempts[0].nativeModel,
    upstreamBody: chatUpstreamBody(attempts[0], request, false, promptCaching),
  });
  const semanticText = semanticQueryText(request.messages || []);
  const semanticHash = semanticParamsHash({
    model: request.model,
    temperature: request.temperature,
    maxTokens: request.max_tokens || request.max_completion_tokens,
    tools: request.tools,
    system: (request.messages || []).filter((message) => message.role === "system").map((message) => String(message.content || "")).join("\n"),
  });

  if (!stream && ttl) {
    const hit = await input.readCache(cacheKey);
    if (hit) {
      await input.record(
        logRow(input.key, {
          providerId: hit.providerId,
          providerType: hit.providerType,
          model: hit.model,
          promptTokens: hit.promptTokens,
          completionTokens: hit.completionTokens,
          costMicros: 0,
          usageSource: hit.usageSource,
          status: 200,
          durationMs: Date.now() - started,
          streamed: false,
          cacheHit: true,
          cacheKind: "exact",
          attempts: [],
        }),
      );
      return Response.json(hit.body, {
        headers: markGuard(gatewayHeaders({ provider: hit.providerType, model: hit.model, attempt: hit.attempt, cache: "HIT", promptCaching }), normalizeGuardAction(input.key.guardAction), guard.findings),
      });
    }
  }

  const semantic = await matchSemanticCache({
    enabled: !stream && Boolean(ttl) && cacheMode === "semantic",
    text: semanticText,
    embedText: input.embedText,
    readSemantic: input.readSemantic,
    lookup: { endpoint: "chat.completions", model: request.model, paramsHash: semanticHash, threshold: similarity },
  });
  if (semantic.hit) {
    await input.record(
      logRow(input.key, {
        providerId: semantic.hit.payload.providerId,
        providerType: semantic.hit.payload.providerType,
        model: semantic.hit.payload.model,
        promptTokens: semantic.hit.payload.promptTokens,
        completionTokens: semantic.hit.payload.completionTokens,
        costMicros: semantic.costMicros,
        usageSource: semantic.hit.payload.usageSource,
        status: 200,
        durationMs: Date.now() - started,
        streamed: false,
        cacheHit: true,
        cacheKind: "semantic",
        attempts: [],
      }),
    );
    return Response.json(semantic.hit.payload.body, {
      headers: markGuard(
        gatewayHeaders({
          provider: semantic.hit.payload.providerType,
          model: semantic.hit.payload.model,
          attempt: semantic.hit.payload.attempt,
          cache: "SEMANTIC",
          similarity: semantic.hit.similarity,
          promptCaching,
        }),
        normalizeGuardAction(input.key.guardAction),
        guard.findings,
      ),
    });
  }

  const attemptsLog: AttemptRecord[] = [];
  let lastFailure: { status: number; error: string; body?: unknown } | null = null;

  for (const attempt of attempts) {
    for (let tryIndex = 0; tryIndex < 2; tryIndex++) {
      const attemptStarted = Date.now();
      const outcome = await callChat({ attempt, request, stream, fetchImpl: input.fetchImpl, estimatedPrompt, promptCaching });
      const durationMs = Date.now() - attemptStarted;
      if (!outcome.ok) {
        attemptsLog.push({
          providerId: attempt.provider.id,
          providerType: attempt.provider.type,
          model: attempt.nativeModel,
          status: outcome.status,
          durationMs,
          error: outcome.error,
        });
        lastFailure = outcome;
        if (!outcome.retryable || tryIndex === 1) {
          if (!outcome.retryable) {
            await recordFailure(input, attemptsLog, outcome.status || 502, outcome.error, started, attempt, stream);
            throw new ProxyError(outcome.status || 502, outcome.error, outcome.body);
          }
          break;
        }
        continue;
      }

      attemptsLog.push({
        providerId: attempt.provider.id,
        providerType: attempt.provider.type,
        model: attempt.nativeModel,
        status: 200,
        durationMs,
      });
      const headers = gatewayHeaders({
        provider: attempt.provider.type,
        model: attempt.nativeModel,
        attempt: attempt.modelStep,
        cache: "MISS",
        promptCaching,
      });

      if (outcome.kind === "stream") {
        headers.set("Content-Type", outcome.contentType);
        headers.set("Cache-Control", "no-cache");
        void outcome.persist
          .then((usage) =>
            input.record(
              logRow(input.key, {
                providerId: attempt.provider.id,
                providerType: attempt.provider.type,
                model: attempt.nativeModel,
                promptTokens: usage.promptTokens,
                completionTokens: usage.completionTokens,
                costMicros: calculateCostMicros({
                  model: attempt.nativeModel,
                  promptTokens: usage.promptTokens,
                  completionTokens: usage.completionTokens,
                  cacheReadTokens: usage.cacheReadTokens,
                  cacheWriteTokens: usage.cacheWriteTokens,
                  promptIncludesCacheRead: usage.promptIncludesCacheRead,
                  overrides: input.overrides,
                }),
                usageSource: usage.usageSource,
                status: 200,
                durationMs: Date.now() - started,
                streamed: true,
                cacheHit: false,
                cacheKind: "miss",
                cacheReadTokens: usage.cacheReadTokens,
                cacheWriteTokens: usage.cacheWriteTokens,
                attempts: attemptsLog,
              }),
            ),
          )
          .catch(() => undefined);
        return new Response(outcome.stream, { status: 200, headers: markGuard(headers, normalizeGuardAction(input.key.guardAction), guard.findings) });
      }

      const costMicros = calculateCostMicros({
        model: attempt.nativeModel,
        promptTokens: outcome.usage.promptTokens,
        completionTokens: outcome.usage.completionTokens,
        cacheReadTokens: outcome.usage.cacheReadTokens,
        cacheWriteTokens: outcome.usage.cacheWriteTokens,
        promptIncludesCacheRead: outcome.usage.promptIncludesCacheRead,
        overrides: input.overrides,
      }) + semantic.costMicros;
      await input.record(
        logRow(input.key, {
          providerId: attempt.provider.id,
          providerType: attempt.provider.type,
          model: attempt.nativeModel,
          promptTokens: outcome.usage.promptTokens,
          completionTokens: outcome.usage.completionTokens,
          costMicros,
          usageSource: outcome.usage.usageSource,
          status: 200,
          durationMs: Date.now() - started,
          streamed: false,
          cacheHit: false,
          cacheKind: "miss",
          cacheReadTokens: outcome.usage.cacheReadTokens,
          cacheWriteTokens: outcome.usage.cacheWriteTokens,
          attempts: attemptsLog,
        }),
      );
      if (ttl) {
        const payload = {
          body: outcome.json,
          providerId: attempt.provider.id,
          providerType: attempt.provider.type,
          model: attempt.nativeModel,
          attempt: attempt.modelStep,
          promptTokens: outcome.usage.promptTokens,
          completionTokens: outcome.usage.completionTokens,
          usageSource: outcome.usage.usageSource,
        };
        await input.writeCache(cacheKey, payload, ttl);
        if (cacheMode === "semantic" && semantic.embedding && input.writeSemantic) {
          await input.writeSemantic({
            endpoint: "chat.completions",
            model: request.model,
            paramsHash: semanticHash,
            embedding: semantic.embedding,
            threshold: similarity,
            payload,
            ttlSeconds: ttl,
          });
        }
      }
      return Response.json(outcome.json, { headers: markGuard(headers, normalizeGuardAction(input.key.guardAction), guard.findings) });
    }
  }

  const status = lastFailure && lastFailure.status >= 400 ? lastFailure.status : 502;
  const error = lastFailure?.error || "Upstream error";
  await recordFailure(input, attemptsLog, status, error, started, attempts[attempts.length - 1], stream);
  throw new ProxyError(status, error, lastFailure?.body);
}

export async function handleEmbeddings(
  input: HandleDeps & {
    key: GatewayKey;
    body: { model: string; input: unknown; gateway?: unknown; [key: string]: unknown };
    fallbackHeader: string | null;
    cacheTtlHeader: string | null;
    providers: RoutedProvider[];
    overrides: PriceOverride[];
  },
) {
  const started = Date.now();
  assertBudgets(input.key);
  await input.consumeRateLimit();

  const gateway = input.body.gateway;
  const request = withoutGateway(input.body);
  const fallbacks = resolveFallbackModels(input.fallbackHeader, gateway, input.key.fallbacks);
  const ttl = resolveCacheTtl(resolveRequestCacheTtl(input.cacheTtlHeader, gateway), input.key.cacheTtlSeconds);
  const planned = planAttempts(input.providers, request.model, fallbacks);
  const attempts = planned.filter((attempt) => attempt.provider.type !== "anthropic");
  if (attempts.length === 0) {
    throw new ProxyError(
      400,
      planned.length ? "Embeddings are not supported for Anthropic providers" : `No provider configured for model ${request.model}`,
    );
  }
  const guard = await beginGuard({
    action: normalizeGuardAction(input.key.guardAction),
    text: collectText(request.input),
    record: input.record,
    blockedRow: () =>
      logRow(input.key, {
        providerId: attempts[0].provider.id,
        providerType: attempts[0].provider.type,
        model: attempts[0].nativeModel,
        promptTokens: 0,
        completionTokens: 0,
        costMicros: 0,
        usageSource: "estimated",
        status: 403,
        durationMs: Date.now() - started,
        streamed: false,
        cacheHit: false,
        cacheKind: "miss",
        attempts: [],
        error: "Request blocked by threat detection",
      }),
  });
  input.record = guard.record;

  const estimatedPrompt = estimatePromptTokens([
    { role: "user", content: typeof request.input === "string" ? request.input : JSON.stringify(request.input) },
  ]);
  const cacheKey = responseCacheKey({
    organizationId: input.key.organizationId,
    apiKeyId: input.key.id,
    endpoint: "embeddings",
    providerType: attempts[0].provider.type,
    model: attempts[0].nativeModel,
    upstreamBody: { ...request, model: attempts[0].nativeModel },
  });

  if (ttl) {
    const hit = await input.readCache(cacheKey);
    if (hit) {
      await input.record(
        logRow(input.key, {
          providerId: hit.providerId,
          providerType: hit.providerType,
          model: hit.model,
          promptTokens: hit.promptTokens,
          completionTokens: 0,
          costMicros: 0,
          usageSource: hit.usageSource,
          status: 200,
          durationMs: Date.now() - started,
          streamed: false,
          cacheHit: true,
          attempts: [],
        }),
      );
      return Response.json(hit.body, {
        headers: gatewayHeaders({ provider: hit.providerType, model: hit.model, attempt: hit.attempt, cache: "HIT" }),
      });
    }
  }

  const attemptsLog: AttemptRecord[] = [];
  let lastFailure: { status: number; error: string; body?: unknown } | null = null;
  for (const attempt of attempts) {
    for (let tryIndex = 0; tryIndex < 2; tryIndex++) {
      const attemptStarted = Date.now();
      const outcome = await callEmbeddings({ attempt, body: request, fetchImpl: input.fetchImpl, estimatedPrompt });
      const durationMs = Date.now() - attemptStarted;
      if (!outcome.ok) {
        attemptsLog.push({
          providerId: attempt.provider.id,
          providerType: attempt.provider.type,
          model: attempt.nativeModel,
          status: outcome.status,
          durationMs,
          error: outcome.error,
        });
        lastFailure = outcome;
        if (!outcome.retryable || tryIndex === 1) {
          if (!outcome.retryable) {
            await recordFailure(input, attemptsLog, outcome.status || 502, outcome.error, started, attempt, false);
            throw new ProxyError(outcome.status || 502, outcome.error, outcome.body);
          }
          break;
        }
        continue;
      }

      attemptsLog.push({
        providerId: attempt.provider.id,
        providerType: attempt.provider.type,
        model: attempt.nativeModel,
        status: 200,
        durationMs,
      });
      const costMicros = calculateCostMicros({
        model: attempt.nativeModel,
        promptTokens: outcome.usage.promptTokens,
        completionTokens: 0,
        overrides: input.overrides,
      });
      await input.record(
        logRow(input.key, {
          providerId: attempt.provider.id,
          providerType: attempt.provider.type,
          model: attempt.nativeModel,
          promptTokens: outcome.usage.promptTokens,
          completionTokens: 0,
          costMicros,
          usageSource: outcome.usage.usageSource,
          status: 200,
          durationMs: Date.now() - started,
          streamed: false,
          cacheHit: false,
          attempts: attemptsLog,
        }),
      );
      if (ttl) {
        await input.writeCache(
          cacheKey,
          {
            body: outcome.json,
            providerId: attempt.provider.id,
            providerType: attempt.provider.type,
            model: attempt.nativeModel,
            attempt: attempt.modelStep,
            promptTokens: outcome.usage.promptTokens,
            completionTokens: 0,
            usageSource: outcome.usage.usageSource,
          },
          ttl,
        );
      }
      return Response.json(outcome.json, {
        headers: gatewayHeaders({
          provider: attempt.provider.type,
          model: attempt.nativeModel,
          attempt: attempt.modelStep,
          cache: "MISS",
        }),
      });
    }
  }

  const status = lastFailure && lastFailure.status >= 400 ? lastFailure.status : 502;
  const error = lastFailure?.error || "Upstream embeddings error";
  await recordFailure(input, attemptsLog, status, error, started, attempts[attempts.length - 1], false);
  throw new ProxyError(status, error, lastFailure?.body);
}

async function callChat(input: {
  attempt: PlannedAttempt;
  request: ChatCompletionRequest;
  stream: boolean;
  fetchImpl: typeof fetch;
  estimatedPrompt: number;
  promptCaching: boolean;
}): Promise<ChatSuccess> {
  const { attempt, request, stream } = input;
  if (attempt.provider.type === "anthropic") {
    return callAnthropic(input);
  }
  const base = (attempt.provider.baseUrl || defaultProviderBase(attempt.provider.type)).replace(/\/$/, "");
  const posted = await postJson(input.fetchImpl, `${base}/chat/completions`, {
    Authorization: `Bearer ${attempt.provider.apiKey}`,
    "Content-Type": "application/json",
  }, chatUpstreamBody(attempt, request, stream, input.promptCaching));
  if (!posted.ok) {
    return posted;
  }
  const response = posted.response;
  if (stream) {
    if (!response.ok || !response.body) {
      const err = await safeJson(response);
      return {
        ok: false,
        status: response.status,
        error: messageFromUpstream(err),
        retryable: isRetryableStatus(response.status),
        body: err,
      };
    }
    const [clientStream, logStream] = response.body.tee();
    const persist = new Response(logStream).text().then((text) => {
      const usage = usageFromOpenAIStream(text);
      return {
        promptTokens: usage?.prompt_tokens ?? input.estimatedPrompt,
        completionTokens: usage?.completion_tokens ?? 0,
        usageSource: usage ? "provider" as const : "estimated" as const,
        cacheReadTokens: cachedInputTokens(usage ?? undefined),
        promptIncludesCacheRead: true,
      };
    });
    return {
      ok: true,
      kind: "stream",
      stream: clientStream,
      contentType: response.headers.get("Content-Type") || "text/event-stream",
      persist,
    };
  }
  const json = (await response.json()) as { usage?: Usage & { prompt_tokens_details?: { cached_tokens?: number } }; error?: { message?: string } };
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: json.error?.message || "Upstream error",
      retryable: isRetryableStatus(response.status),
      body: json,
    };
  }
  return {
    ok: true,
    kind: "json",
    json,
    usage: {
      promptTokens: json.usage?.prompt_tokens ?? input.estimatedPrompt,
      completionTokens: json.usage?.completion_tokens ?? 0,
      usageSource: json.usage ? "provider" : "estimated",
      cacheReadTokens: cachedInputTokens(json.usage),
      promptIncludesCacheRead: true,
    },
  };
}

async function callAnthropic(input: {
  attempt: PlannedAttempt;
  request: ChatCompletionRequest;
  stream: boolean;
  fetchImpl: typeof fetch;
  estimatedPrompt: number;
  promptCaching: boolean;
}): Promise<ChatSuccess> {
  const base = (input.attempt.provider.baseUrl || ANTHROPIC_BASE).replace(/\/$/, "");
  const posted = await postJson(
    input.fetchImpl,
    `${base}/v1/messages`,
    {
      "x-api-key": input.attempt.provider.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    chatUpstreamBody(input.attempt, input.request, input.stream, input.promptCaching),
  );
  if (!posted.ok) {
    return posted;
  }
  if (input.stream) {
    const raw = await posted.response.text();
    if (!posted.response.ok) {
      return {
        ok: false,
        status: posted.response.status,
        error: "Anthropic stream error",
        retryable: isRetryableStatus(posted.response.status),
        body: safeParse(raw),
      };
    }
    const usage = anthropicUsageFromSse(raw);
    const body = new Response(anthropicSseToOpenAI(raw, input.attempt.nativeModel)).body;
    if (!body) {
      return { ok: false, status: 502, error: "Anthropic stream was empty", retryable: true };
    }
    return {
      ok: true,
      kind: "stream",
      stream: body,
      contentType: "text/event-stream",
      persist: Promise.resolve({
        promptTokens: usage.promptTokens || input.estimatedPrompt,
        completionTokens: usage.completionTokens,
        usageSource: usage.promptTokens || usage.completionTokens ? "provider" : "estimated",
        cacheReadTokens: usage.cacheReadTokens,
        cacheWriteTokens: usage.cacheWriteTokens,
      }),
    };
  }
  const json = (await posted.response.json()) as {
    error?: { message?: string };
    usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
  };
  if (!posted.response.ok) {
    return {
      ok: false,
      status: posted.response.status,
      error: json.error?.message || "Anthropic error",
      retryable: isRetryableStatus(posted.response.status),
      body: json,
    };
  }
  const openAI = anthropicToOpenAIResponse(json);
  return {
    ok: true,
    kind: "json",
    json: openAI,
    usage: {
      promptTokens: openAI.usage.prompt_tokens,
      completionTokens: openAI.usage.completion_tokens,
      usageSource: json.usage ? "provider" : "estimated",
      cacheReadTokens: json.usage?.cache_read_input_tokens,
      cacheWriteTokens: json.usage?.cache_creation_input_tokens,
      promptIncludesCacheRead: false,
    },
  };
}

async function callEmbeddings(input: {
  attempt: PlannedAttempt;
  body: { model: string; input: unknown; [key: string]: unknown };
  fetchImpl: typeof fetch;
  estimatedPrompt: number;
}): Promise<{ ok: true; json: unknown; usage: UsageCounts } | { ok: false; status: number; error: string; retryable: boolean; body?: unknown }> {
  const base = (input.attempt.provider.baseUrl || defaultProviderBase(input.attempt.provider.type)).replace(/\/$/, "");
  const posted = await postJson(
    input.fetchImpl,
    `${base}/embeddings`,
    {
      Authorization: `Bearer ${input.attempt.provider.apiKey}`,
      "Content-Type": "application/json",
    },
    { ...input.body, model: input.attempt.nativeModel },
  );
  if (!posted.ok) {
    return posted;
  }
  const json = (await posted.response.json()) as { usage?: Usage; error?: { message?: string } };
  if (!posted.response.ok) {
    return {
      ok: false,
      status: posted.response.status,
      error: json.error?.message || "Upstream embeddings error",
      retryable: isRetryableStatus(posted.response.status),
      body: json,
    };
  }
  return {
    ok: true,
    json,
    usage: {
      promptTokens: json.usage?.prompt_tokens ?? input.estimatedPrompt,
      completionTokens: 0,
      usageSource: json.usage ? "provider" : "estimated",
    },
  };
}

function chatUpstreamBody(attempt: PlannedAttempt, request: ChatCompletionRequest, stream: boolean, promptCaching: boolean) {
  if (attempt.provider.type === "anthropic") {
    const mapped = toAnthropicMessages(request.messages || []);
    return applyAnthropicPromptCache(
      {
        model: attempt.nativeModel,
        system: mapped.system || undefined,
        messages: mapped.messages,
        max_tokens: request.max_tokens || request.max_completion_tokens || 1024,
        temperature: request.temperature,
        tools: toAnthropicTools(request.tools),
        stream,
      },
      promptCaching,
    );
  }
  return {
    ...request,
    model: attempt.nativeModel,
    stream,
    stream_options: stream ? { include_usage: true, ...request.stream_options } : request.stream_options,
  };
}

async function postJson(
  fetchImpl: typeof fetch,
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<{ ok: true; response: Response } | { ok: false; status: number; error: string; retryable: true }> {
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    return { ok: true, response };
  } catch (error) {
    const timeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return {
      ok: false,
      status: 0,
      error: timeout ? "Upstream timeout" : error instanceof Error ? error.message : "Network error",
      retryable: true,
    };
  }
}

function gatewayHeaders(input: { provider: string; model: string; attempt: number; cache: "HIT" | "MISS" | "SEMANTIC"; similarity?: number; promptCaching?: boolean }) {
  const headers = new Headers();
  headers.set("x-ai-gateway-provider", input.provider);
  headers.set("x-ai-gateway-model", input.model);
  headers.set("x-ai-gateway-attempt", String(input.attempt));
  headers.set("x-ai-gateway-cache", input.cache);
  if (input.similarity != null) headers.set("x-ai-gateway-similarity", input.similarity.toFixed(3));
  if (input.promptCaching) headers.set("x-ai-gateway-prompt-cache", "auto");
  return headers;
}

function logRow(
  key: GatewayKey,
  input: {
    providerId: string | null;
    providerType: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    costMicros: number;
    usageSource: "provider" | "estimated";
    status: number;
    durationMs: number;
    streamed: boolean;
    cacheHit: boolean;
    cacheKind?: "miss" | "exact" | "semantic";
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    attempts: AttemptRecord[];
    error?: string;
  },
): RequestLog {
  return {
    organizationId: key.organizationId,
    gatewayId: key.gatewayId,
    apiKeyId: key.id,
    providerId: input.providerId,
    providerType: input.providerType,
    model: input.model,
    promptTokens: input.promptTokens,
    completionTokens: input.completionTokens,
    costMicros: input.costMicros,
    usageSource: input.usageSource,
    status: input.status,
    durationMs: input.durationMs,
    streamed: input.streamed,
    cacheHit: input.cacheHit,
    cacheKind: input.cacheKind,
    cacheReadTokens: input.cacheReadTokens,
    cacheWriteTokens: input.cacheWriteTokens,
    attemptsJson: JSON.stringify(input.attempts),
    error: input.error,
  };
}

async function recordFailure(
  input: HandleDeps & { key: GatewayKey },
  attempts: AttemptRecord[],
  status: number,
  error: string,
  started: number,
  attempt: PlannedAttempt,
  streamed: boolean,
) {
  await input.record(
    logRow(input.key, {
      providerId: attempt.provider.id,
      providerType: attempt.provider.type,
      model: attempt.nativeModel,
      promptTokens: 0,
      completionTokens: 0,
      costMicros: 0,
      usageSource: "estimated",
      status,
      durationMs: Date.now() - started,
      streamed,
      cacheHit: false,
      attempts,
      error,
    }),
  );
}

function safeParse(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    return { error: { message: raw.slice(0, 200) } };
  }
}

async function safeJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return { error: { message: response.statusText || "Upstream error" } };
  }
}

function messageFromUpstream(err: unknown) {
  if (err && typeof err === "object" && "error" in err) {
    const nested = (err as { error?: { message?: string } }).error;
    if (nested?.message) {
      return nested.message;
    }
  }
  return "Upstream error";
}
