import { calculateCostMicros, type PriceOverride } from "@/lib/cost/catalog";
import { responseCacheKey, resolveCacheTtl } from "@/lib/llm/cache";
import { assertBudgets } from "@/lib/llm/limits";
import { beginGuard, collectText, markGuard, normalizeGuardAction } from "@/lib/llm/guard";
import { applyAnthropicPromptCache, resolvePromptCaching } from "@/lib/llm/prompt-cache";
import { isRetryableStatus, planAttempts, resolveFallbackModels, resolveRequestCacheTtl, withoutGateway } from "@/lib/llm/route";
import { matchSemanticCache, resolveCacheMode, resolveSimilarity, semanticParamsHash, semanticQueryText, type SemanticLookup } from "@/lib/llm/semantic";
import {
  anthropicMessageToSse,
  anthropicRequestToChat,
  anthropicToResponses,
  chatCompletionToAnthropic,
  responsesObjectToSse,
  responsesRequestToAnthropic,
  usageFromResponsesStream,
  type AnthropicMessageRequest,
  type AnthropicMessageResponse,
  type ResponsesRequest,
} from "@/lib/llm/translate";
import { ProxyError, type AttemptRecord, type CachedPayload, type GatewayKey, type PlannedAttempt, type RequestLog, type RoutedProvider, type UsageCounts } from "@/lib/llm/types";
import { anthropicUsageFromSse, estimatePromptTokens } from "@/lib/llm/anthropic";
import { ANTHROPIC_BASE, defaultProviderBase } from "@/lib/llm/providers";

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

type Outcome =
  | { ok: true; kind: "json"; json: unknown; usage: UsageCounts }
  | { ok: true; kind: "stream"; stream: ReadableStream<Uint8Array>; contentType: string; persist: Promise<UsageCounts> }
  | { ok: false; status: number; error: string; retryable: boolean; body?: unknown };

export async function handleMessages(
  input: HandleDeps & {
    key: GatewayKey;
    request: AnthropicMessageRequest;
    fallbackHeader: string | null;
    cacheTtlHeader: string | null;
    promptCacheHeader?: string | null;
    cacheModeHeader?: string | null;
    similarityHeader?: string | null;
    anthropicVersion: string | null;
    providers: RoutedProvider[];
    overrides: PriceOverride[];
  },
) {
  const request = withoutGateway(input.request) as AnthropicMessageRequest;
  const promptCaching = resolvePromptCaching(input.promptCacheHeader ?? null, input.request.gateway) === "auto";
  return runNative({
    ...input,
    endpoint: "messages",
    model: request.model,
    gateway: input.request.gateway,
    stream: Boolean(request.stream),
    promptCaching,
    cacheMode: resolveCacheMode(input.cacheModeHeader ?? null, input.request.gateway, input.key.cacheMode),
    similarity: resolveSimilarity(input.similarityHeader ?? null, input.request.gateway, input.key.similarityThreshold),
    semanticText: semanticQueryText(request.messages || []),
    semanticHash: semanticParamsHash({
      model: request.model,
      temperature: request.temperature,
      maxTokens: request.max_tokens,
      tools: request.tools,
      system: typeof request.system === "string" ? request.system : "",
    }),
    guardText: { messages: request.messages, system: request.system },
    estimatedPrompt: estimatePromptTokens([{ role: "user", content: JSON.stringify(request.messages || []) }]),
    upstreamBody: (attempt) => messagesBody(attempt, request, false, promptCaching),
    call: (attempt, stream) => callMessages(attempt, request, stream, input.fetchImpl, input.anthropicVersion, promptCaching),
  });
}

export async function handleResponses(
  input: HandleDeps & {
    key: GatewayKey;
    request: ResponsesRequest;
    fallbackHeader: string | null;
    cacheTtlHeader: string | null;
    promptCacheHeader?: string | null;
    cacheModeHeader?: string | null;
    similarityHeader?: string | null;
    providers: RoutedProvider[];
    overrides: PriceOverride[];
  },
) {
  const request = withoutGateway(input.request) as ResponsesRequest;
  const promptCaching = resolvePromptCaching(input.promptCacheHeader ?? null, input.request.gateway) === "auto";
  const messages = typeof request.input === "string" ? [{ role: "user", content: request.input }] : [];
  return runNative({
    ...input,
    endpoint: "responses",
    model: request.model,
    gateway: input.request.gateway,
    stream: Boolean(request.stream),
    promptCaching,
    cacheMode: resolveCacheMode(input.cacheModeHeader ?? null, input.request.gateway, input.key.cacheMode),
    similarity: resolveSimilarity(input.similarityHeader ?? null, input.request.gateway, input.key.similarityThreshold),
    semanticText: semanticQueryText(messages),
    semanticHash: semanticParamsHash({
      model: request.model,
      temperature: request.temperature,
      maxTokens: request.max_output_tokens,
      tools: request.tools,
      system: typeof request.instructions === "string" ? request.instructions : "",
    }),
    guardText: { input: request.input, instructions: request.instructions },
    estimatedPrompt: estimatePromptTokens([{ role: "user", content: typeof request.input === "string" ? request.input : JSON.stringify(request.input ?? "") }]),
    upstreamBody: (attempt) => responsesBody(attempt, request, false, promptCaching),
    call: (attempt, stream) => callResponses(attempt, request, stream, input.fetchImpl, promptCaching),
  });
}

async function runNative(
  input: HandleDeps & {
    key: GatewayKey;
    endpoint: string;
    model: string;
    gateway: unknown;
    fallbackHeader: string | null;
    cacheTtlHeader: string | null;
    providers: RoutedProvider[];
    overrides: PriceOverride[];
    stream: boolean;
    promptCaching: boolean;
    cacheMode: "exact" | "semantic";
    similarity: number;
    semanticText: string | null;
    semanticHash: string;
    guardText: unknown;
    estimatedPrompt: number;
    upstreamBody: (attempt: PlannedAttempt) => unknown;
    call: (attempt: PlannedAttempt, stream: boolean) => Promise<Outcome>;
  },
) {
  const started = Date.now();
  assertBudgets(input.key);
  await input.consumeRateLimit();
  const fallbacks = resolveFallbackModels(input.fallbackHeader, input.gateway, input.key.fallbacks);
  const ttl = resolveCacheTtl(resolveRequestCacheTtl(input.cacheTtlHeader, input.gateway), input.key.cacheTtlSeconds);
  const attempts = planAttempts(input.providers, input.model, fallbacks);
  if (attempts.length === 0) throw new ProxyError(400, `No provider configured for model ${input.model}`);
  const guard = await beginGuard({
    action: normalizeGuardAction(input.key.guardAction),
    text: collectText(input.guardText),
    record: input.record,
    blockedRow: () => ({
      organizationId: input.key.organizationId,
      gatewayId: input.key.gatewayId,
      apiKeyId: input.key.id,
      providerId: attempts[0].provider.id,
      providerType: attempts[0].provider.type,
      model: attempts[0].nativeModel,
      promptTokens: input.estimatedPrompt,
      completionTokens: 0,
      costMicros: 0,
      usageSource: "estimated",
      status: 403,
      durationMs: Date.now() - started,
      streamed: input.stream,
      cacheHit: false,
      cacheKind: "miss",
      attemptsJson: "[]",
      error: "Request blocked by threat detection",
    }),
  });
  input.record = guard.record;

  const cacheKey = responseCacheKey({
    organizationId: input.key.organizationId,
    apiKeyId: input.key.id,
    endpoint: input.endpoint,
    providerType: attempts[0].provider.type,
    model: attempts[0].nativeModel,
    upstreamBody: input.upstreamBody(attempts[0]),
  });
  if (!input.stream && ttl) {
    const hit = await input.readCache(cacheKey);
    if (hit) {
      await input.record(logFrom(input.key, hit, Date.now() - started));
      return Response.json(hit.body, { headers: markGuard(gatewayHeaders(hit.providerType, hit.model, hit.attempt, "HIT", undefined, input.promptCaching), normalizeGuardAction(input.key.guardAction), guard.findings) });
    }
  }

  const semantic = await matchSemanticCache({
    enabled: !input.stream && Boolean(ttl) && input.cacheMode === "semantic",
    text: input.semanticText,
    embedText: input.embedText,
    readSemantic: input.readSemantic,
    lookup: { endpoint: input.endpoint, model: input.model, paramsHash: input.semanticHash, threshold: input.similarity },
  });
  if (semantic.hit) {
    await input.record({
      ...logFrom(input.key, semantic.hit.payload, Date.now() - started),
      costMicros: semantic.costMicros,
      cacheKind: "semantic",
    });
    return Response.json(semantic.hit.payload.body, {
      headers: markGuard(gatewayHeaders(semantic.hit.payload.providerType, semantic.hit.payload.model, semantic.hit.payload.attempt, "SEMANTIC", semantic.hit.similarity, input.promptCaching), normalizeGuardAction(input.key.guardAction), guard.findings),
    });
  }

  const attemptsLog: AttemptRecord[] = [];
  let lastFailure: { status: number; error: string; body?: unknown } | null = null;
  for (const attempt of attempts) {
    for (let tryIndex = 0; tryIndex < 2; tryIndex++) {
      const attemptStarted = Date.now();
      const outcome = await input.call(attempt, input.stream);
      const durationMs = Date.now() - attemptStarted;
      if (!outcome.ok) {
        attemptsLog.push(attemptRecord(attempt, outcome.status, durationMs, outcome.error));
        lastFailure = outcome;
        if (!outcome.retryable) {
          await recordFailure(input, attemptsLog, outcome.status || 502, outcome.error, started, attempt);
          throw new ProxyError(outcome.status || 502, outcome.error, outcome.body);
        }
        if (tryIndex === 1) break;
        continue;
      }
      attemptsLog.push(attemptRecord(attempt, 200, durationMs));
      const headers = gatewayHeaders(attempt.provider.type, attempt.nativeModel, attempt.modelStep, "MISS", undefined, input.promptCaching);
      if (outcome.kind === "stream") {
        headers.set("Content-Type", outcome.contentType);
        headers.set("Cache-Control", "no-cache");
        void outcome.persist
          .then((usage) => input.record(successLog(input, attempt, usage, attemptsLog, started, true)))
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
      await input.record({
        ...successLog(input, attempt, outcome.usage, attemptsLog, started, false),
        costMicros,
      });
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
        if (input.cacheMode === "semantic" && semantic.embedding && input.writeSemantic) {
          await input.writeSemantic({
            endpoint: input.endpoint,
            model: input.model,
            paramsHash: input.semanticHash,
            embedding: semantic.embedding,
            threshold: input.similarity,
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
  await recordFailure(input, attemptsLog, status, error, started, attempts[attempts.length - 1]);
  throw new ProxyError(status, error, lastFailure?.body);
}

async function callMessages(attempt: PlannedAttempt, request: AnthropicMessageRequest, stream: boolean, fetchImpl: typeof fetch, anthropicVersion: string | null, promptCaching: boolean): Promise<Outcome> {
  if (attempt.provider.type === "anthropic") {
    return postStreamOrJson({
      fetchImpl,
      url: `${baseUrl(attempt, ANTHROPIC_BASE)}/v1/messages`,
      headers: {
        "x-api-key": attempt.provider.apiKey,
        "anthropic-version": anthropicVersion || "2023-06-01",
        "Content-Type": "application/json",
      },
      body: messagesBody(attempt, request, stream, promptCaching),
      stream,
      parseStream: (payload) => {
        const usage = anthropicUsageFromSse(payload);
        return { promptTokens: usage.promptTokens, completionTokens: usage.completionTokens, usageSource: usage.promptTokens || usage.completionTokens ? "provider" : "estimated" };
      },
    });
  }
  const posted = await postJson(fetchImpl, `${baseUrl(attempt, defaultProviderBase(attempt.provider.type))}/chat/completions`, {
    Authorization: `Bearer ${attempt.provider.apiKey}`,
    "Content-Type": "application/json",
  }, { ...anthropicRequestToChat(request), model: attempt.nativeModel });
  if (!posted.ok) return posted;
  const json = await posted.response.json();
  if (!posted.response.ok) return httpFailure(posted.response.status, json, "Upstream error");
  const message = chatCompletionToAnthropic(json, attempt.nativeModel);
  return finishTranslated(stream, message, anthropicMessageToSse(message), usageOf(message));
}

async function callResponses(attempt: PlannedAttempt, request: ResponsesRequest, stream: boolean, fetchImpl: typeof fetch, promptCaching: boolean): Promise<Outcome> {
  if (attempt.provider.type === "gemini") {
    const chat = anthropicRequestToChat(responsesRequestToAnthropic(request));
    const posted = await postJson(
      fetchImpl,
      `${baseUrl(attempt, defaultProviderBase("gemini"))}/chat/completions`,
      { Authorization: `Bearer ${attempt.provider.apiKey}`, "Content-Type": "application/json" },
      { ...chat, model: attempt.nativeModel, stream: false },
    );
    if (!posted.ok) return posted;
    const json = await posted.response.json();
    if (!posted.response.ok) return httpFailure(posted.response.status, json, "Upstream error");
    const response = anthropicToResponses(chatCompletionToAnthropic(json, attempt.nativeModel));
    return finishTranslated(stream, response, responsesObjectToSse(response), {
      promptTokens: response.usage.input_tokens,
      completionTokens: response.usage.output_tokens,
      usageSource: "provider",
    });
  }
  if (attempt.provider.type !== "anthropic") {
    return postStreamOrJson({
      fetchImpl,
      url: `${baseUrl(attempt, defaultProviderBase(attempt.provider.type))}/responses`,
      headers: { Authorization: `Bearer ${attempt.provider.apiKey}`, "Content-Type": "application/json" },
      body: responsesBody(attempt, request, stream, promptCaching),
      stream,
      parseStream: (payload) => {
        const usage = usageFromResponsesStream(payload);
        return {
          promptTokens: usage?.promptTokens ?? 0,
          completionTokens: usage?.completionTokens ?? 0,
          usageSource: usage ? "provider" : "estimated",
        };
      },
    });
  }
  const posted = await postJson(fetchImpl, `${baseUrl(attempt, ANTHROPIC_BASE)}/v1/messages`, {
    "x-api-key": attempt.provider.apiKey,
    "anthropic-version": "2023-06-01",
    "Content-Type": "application/json",
  }, messagesBodyForResponses(attempt, request, promptCaching));
  if (!posted.ok) return posted;
  const json = (await posted.response.json()) as AnthropicMessageResponse & { error?: { message?: string } };
  if (!posted.response.ok) return httpFailure(posted.response.status, json, json.error?.message || "Anthropic error");
  const response = anthropicToResponses({ ...json, model: json.model || attempt.nativeModel });
  return finishTranslated(stream, response, responsesObjectToSse(response), {
    promptTokens: response.usage.input_tokens,
    completionTokens: response.usage.output_tokens,
    usageSource: "provider",
  });
}

function messagesBody(attempt: PlannedAttempt, request: AnthropicMessageRequest, stream: boolean, promptCaching: boolean) {
  if (attempt.provider.type === "anthropic") {
    return applyAnthropicPromptCache({ ...request, model: attempt.nativeModel, stream }, promptCaching);
  }
  return { ...anthropicRequestToChat(request), model: attempt.nativeModel };
}

function responsesBody(attempt: PlannedAttempt, request: ResponsesRequest, stream: boolean, promptCaching: boolean) {
  if (attempt.provider.type !== "anthropic") return { ...request, model: attempt.nativeModel, stream };
  return messagesBodyForResponses(attempt, request, promptCaching);
}

function messagesBodyForResponses(attempt: PlannedAttempt, request: ResponsesRequest, promptCaching: boolean) {
  return applyAnthropicPromptCache({ ...responsesRequestToAnthropic(request), model: attempt.nativeModel }, promptCaching);
}

function finishTranslated(stream: boolean, json: unknown, sseBody: string, usage: UsageCounts): Outcome {
  if (!stream) return { ok: true, kind: "json", json, usage };
  const body = new Response(sseBody).body;
  if (!body) return { ok: false, status: 502, error: "Could not encode stream", retryable: true };
  return { ok: true, kind: "stream", stream: body, contentType: "text/event-stream", persist: Promise.resolve(usage) };
}

async function postStreamOrJson(input: {
  fetchImpl: typeof fetch;
  url: string;
  headers: Record<string, string>;
  body: unknown;
  stream: boolean;
  parseStream: (payload: string) => UsageCounts;
}): Promise<Outcome> {
  const posted = await postJson(input.fetchImpl, input.url, input.headers, input.body);
  if (!posted.ok) return posted;
  if (input.stream) {
    if (!posted.response.ok || !posted.response.body) {
      const err = await safeJson(posted.response);
      return httpFailure(posted.response.status, err, messageFrom(err));
    }
    const [clientStream, logStream] = posted.response.body.tee();
    const persist = new Response(logStream).text().then((text) => input.parseStream(text));
    return {
      ok: true,
      kind: "stream",
      stream: clientStream,
      contentType: posted.response.headers.get("Content-Type") || "text/event-stream",
      persist,
    };
  }
  const json = await posted.response.json();
  if (!posted.response.ok) return httpFailure(posted.response.status, json, messageFrom(json));
  const usage = usageFromJson(json);
  return { ok: true, kind: "json", json, usage };
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
    return { ok: false, status: 0, error: timeout ? "Upstream timeout" : error instanceof Error ? error.message : "Network error", retryable: true };
  }
}

function httpFailure(status: number, body: unknown, fallback: string): Outcome {
  return { ok: false, status, error: messageFrom(body) || fallback, retryable: isRetryableStatus(status), body };
}

function usageFromJson(json: unknown): UsageCounts {
  const record = json && typeof json === "object" ? (json as Record<string, unknown>) : {};
  const usage = record.usage && typeof record.usage === "object" ? (record.usage as Record<string, unknown>) : {};
  if ("input_tokens" in usage || "output_tokens" in usage) {
    return {
      promptTokens: numberOf(usage.input_tokens),
      completionTokens: numberOf(usage.output_tokens),
      cacheReadTokens: numberOf(usage.cache_read_input_tokens),
      cacheWriteTokens: numberOf(usage.cache_creation_input_tokens),
      usageSource: "provider" as const,
      promptIncludesCacheRead: false,
    };
  }
  if ("prompt_tokens" in usage || "completion_tokens" in usage) {
    const details = usage.prompt_tokens_details as { cached_tokens?: number } | undefined;
    const inputDetails = usage.input_tokens_details as { cached_tokens?: number } | undefined;
    return {
      promptTokens: numberOf(usage.prompt_tokens),
      completionTokens: numberOf(usage.completion_tokens),
      cacheReadTokens: details?.cached_tokens || inputDetails?.cached_tokens || 0,
      usageSource: "provider" as const,
      promptIncludesCacheRead: true,
    };
  }
  return { promptTokens: 0, completionTokens: 0, usageSource: "estimated" };
}

function usageOf(message: AnthropicMessageResponse): UsageCounts {
  return { promptTokens: message.usage.input_tokens, completionTokens: message.usage.output_tokens, usageSource: "provider" };
}

function baseUrl(attempt: PlannedAttempt, fallback: string) {
  return (attempt.provider.baseUrl || fallback).replace(/\/$/, "");
}

function gatewayHeaders(provider: string, model: string, attempt: number, cache: "HIT" | "MISS" | "SEMANTIC", similarity?: number, promptCaching?: boolean) {
  const headers = new Headers();
  headers.set("x-ai-gateway-provider", provider);
  headers.set("x-ai-gateway-model", model);
  headers.set("x-ai-gateway-attempt", String(attempt));
  headers.set("x-ai-gateway-cache", cache);
  if (similarity != null) headers.set("x-ai-gateway-similarity", similarity.toFixed(3));
  if (promptCaching) headers.set("x-ai-gateway-prompt-cache", "auto");
  return headers;
}

function attemptRecord(attempt: PlannedAttempt, status: number, durationMs: number, error?: string): AttemptRecord {
  return { providerId: attempt.provider.id, providerType: attempt.provider.type, model: attempt.nativeModel, status, durationMs, error };
}

function successLog(input: { key: GatewayKey; overrides: PriceOverride[] }, attempt: PlannedAttempt, usage: UsageCounts, attempts: AttemptRecord[], started: number, streamed: boolean): RequestLog {
  return {
    organizationId: input.key.organizationId,
    gatewayId: input.key.gatewayId,
    apiKeyId: input.key.id,
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
    streamed,
    cacheHit: false,
    attemptsJson: JSON.stringify(attempts),
  };
}

function logFrom(key: GatewayKey, hit: CachedPayload, durationMs: number): RequestLog {
  return {
    organizationId: key.organizationId,
    gatewayId: key.gatewayId,
    apiKeyId: key.id,
    providerId: hit.providerId,
    providerType: hit.providerType,
    model: hit.model,
    promptTokens: hit.promptTokens,
    completionTokens: hit.completionTokens,
    costMicros: 0,
    usageSource: hit.usageSource,
    status: 200,
    durationMs,
    streamed: false,
    cacheHit: true,
    cacheKind: "exact",
    attemptsJson: "[]",
  };
}

async function recordFailure(input: HandleDeps & { key: GatewayKey }, attempts: AttemptRecord[], status: number, error: string, started: number, attempt: PlannedAttempt) {
  await input.record({
    organizationId: input.key.organizationId,
    gatewayId: input.key.gatewayId,
    apiKeyId: input.key.id,
    providerId: attempt.provider.id,
    providerType: attempt.provider.type,
    model: attempt.nativeModel,
    promptTokens: 0,
    completionTokens: 0,
    costMicros: 0,
    usageSource: "estimated",
    status,
    durationMs: Date.now() - started,
    streamed: false,
    error,
    cacheHit: false,
    attemptsJson: JSON.stringify(attempts),
  });
}

function messageFrom(err: unknown) {
  if (err && typeof err === "object") {
    const record = err as { error?: { message?: string }; message?: string };
    if (record.error?.message) return record.error.message;
    if (typeof record.message === "string") return record.message;
  }
  return "Upstream error";
}

async function safeJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return { error: { message: response.statusText || "Upstream error" } };
  }
}

function numberOf(value: unknown) {
  return typeof value === "number" ? value : 0;
}
