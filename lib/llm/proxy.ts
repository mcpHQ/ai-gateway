import { and, desc, eq, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { apiKeys, gateways, llmRequests, modelPrices, organizations, providers, rateLimitBuckets, responseCache, semanticCache } from "@/lib/db/schema";
import { cosineSimilarity, type SemanticLookup } from "@/lib/llm/semantic";
import { decryptSecret, hashApiKey } from "@/lib/crypto";
import { calculateCostMicros, type PriceOverride, type ProviderKind } from "@/lib/cost/catalog";
import { defaultProviderBase } from "@/lib/llm/providers";
import { handleChat, handleEmbeddings } from "@/lib/llm/execute";
import { handleMessages, handleResponses } from "@/lib/llm/native";
import type { AnthropicMessageRequest, ResponsesRequest } from "@/lib/llm/translate";
import { minuteWindowStart, retryAfterSeconds, assertBudgets } from "@/lib/llm/limits";
import { ProxyError, type CachedPayload, type GatewayKey, type RequestLog, type RoutedProvider } from "@/lib/llm/types";
import type { ChatCompletionRequest } from "@/lib/llm/anthropic";

export { ProxyError };
export type { GatewayKey };

export function gatewayAuthorization(authorization: string | null, apiKeyHeader: string | null) {
  if (authorization) return authorization;
  const apiKey = apiKeyHeader?.trim();
  return apiKey ? `Bearer ${apiKey}` : null;
}

export async function authenticateGatewayKey(header: string | null): Promise<GatewayKey> {
  if (!header?.toLowerCase().startsWith("bearer ")) {
    throw new ProxyError(401, "Missing bearer token");
  }
  const token = header.slice(7).trim();
  if (!token) {
    throw new ProxyError(401, "Missing bearer token");
  }
  const key = await db.query.apiKeys.findFirst({
    where: eq(apiKeys.keyHash, hashApiKey(token)),
  });
  if (!key || key.disabled) {
    throw new ProxyError(401, key ? "API key is disabled" : "Invalid API key");
  }
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, key.organizationId),
  });
  if (!org) {
    throw new ProxyError(401, "Invalid API key");
  }
  const gateway = key.gatewayId ? await db.query.gateways.findFirst({ where: eq(gateways.id, key.gatewayId) }) : null;

  const now = new Date();
  let periodSpendMicros = key.periodSpendMicros;
  if (!sameMonth(key.periodStart, now)) {
    periodSpendMicros = 0;
    await db
      .update(apiKeys)
      .set({ periodSpendMicros: 0, periodStart: startOfMonth(now) })
      .where(eq(apiKeys.id, key.id));
  }
  let orgPeriodSpendMicros = org.periodSpendMicros;
  let gatewayPeriodSpendMicros = gateway?.periodSpendMicros ?? 0;
  if (gateway && !sameMonth(gateway.periodStart, now)) {
    gatewayPeriodSpendMicros = 0;
    await db.update(gateways).set({ periodSpendMicros: 0, periodStart: startOfMonth(now) }).where(eq(gateways.id, gateway.id));
  }
  if (!sameMonth(org.periodStart, now)) {
    orgPeriodSpendMicros = 0;
    await db
      .update(organizations)
      .set({ periodSpendMicros: 0, periodStart: startOfMonth(now) })
      .where(eq(organizations.id, org.id));
  }

  const gatewayKey: GatewayKey = {
    id: key.id,
    organizationId: key.organizationId,
    monthlyBudgetCents: key.monthlyBudgetCents,
    periodSpendMicros,
    requestsPerMinute: key.requestsPerMinute,
    gatewayId: gateway?.id ?? key.gatewayId,
    orgMonthlyBudgetCents: org.monthlyBudgetCents,
    orgPeriodSpendMicros,
    gatewayMonthlyBudgetCents: gateway?.monthlyBudgetCents ?? null,
    gatewayPeriodSpendMicros,
    cacheTtlSeconds: gateway?.cacheTtlSeconds ?? org.cacheTtlSeconds,
    cacheMode: (gateway?.cacheMode ?? org.cacheMode) === "semantic" ? "semantic" : "exact",
    similarityThreshold: Number(gateway?.similarityThreshold ?? org.similarityThreshold) || 0.95,
    guardAction: (gateway?.guardAction ?? org.guardAction) === "off" || (gateway?.guardAction ?? org.guardAction) === "block" ? ((gateway?.guardAction ?? org.guardAction) as "off" | "block") : "flag",
    fallbacks: parseStringList(gateway?.fallbacksJson ?? org.fallbacksJson),
  };
  assertBudgets(gatewayKey);
  return gatewayKey;
}

export async function proxyChatCompletions(input: {
  key: GatewayKey;
  request: ChatCompletionRequest;
  fallbackHeader?: string | null;
  cacheTtlHeader?: string | null;
  promptCacheHeader?: string | null;
  cacheModeHeader?: string | null;
  similarityHeader?: string | null;
  fetchImpl?: typeof fetch;
}) {
  const [routed, overrides] = await Promise.all([
    loadRoutedProviders(input.key.organizationId),
    orgPriceOverrides(input.key.organizationId),
  ]);
  return handleChat({
    key: input.key,
    request: input.request,
    fallbackHeader: input.fallbackHeader ?? null,
    cacheTtlHeader: input.cacheTtlHeader ?? null,
    promptCacheHeader: input.promptCacheHeader,
    cacheModeHeader: input.cacheModeHeader,
    similarityHeader: input.similarityHeader,
    providers: routed,
    overrides,
    fetchImpl: input.fetchImpl ?? fetch,
    consumeRateLimit: () => consumeRateLimit(input.key),
    readCache: readResponseCache,
    writeCache: (cacheKey, payload, ttlSeconds) => writeResponseCache(cacheKey, payload, ttlSeconds, input.key, "chat.completions"),
    record: recordLlmRequest,
    embedText: (text) => embedForSemantic(routed, text, input.fetchImpl ?? fetch),
    readSemantic: (lookup) => readSemanticCache(input.key, lookup),
    writeSemantic: (entry) => writeSemanticCache(input.key, entry),
  });
}

export async function proxyMessages(input: {
  key: GatewayKey;
  request: AnthropicMessageRequest;
  fallbackHeader?: string | null;
  cacheTtlHeader?: string | null;
  promptCacheHeader?: string | null;
  cacheModeHeader?: string | null;
  similarityHeader?: string | null;
  anthropicVersion?: string | null;
  fetchImpl?: typeof fetch;
}) {
  const [routed, overrides] = await Promise.all([
    loadRoutedProviders(input.key.organizationId),
    orgPriceOverrides(input.key.organizationId),
  ]);
  return handleMessages({
    key: input.key,
    request: input.request,
    fallbackHeader: input.fallbackHeader ?? null,
    cacheTtlHeader: input.cacheTtlHeader ?? null,
    promptCacheHeader: input.promptCacheHeader,
    cacheModeHeader: input.cacheModeHeader,
    similarityHeader: input.similarityHeader,
    anthropicVersion: input.anthropicVersion ?? null,
    providers: routed,
    overrides,
    fetchImpl: input.fetchImpl ?? fetch,
    consumeRateLimit: () => consumeRateLimit(input.key),
    readCache: readResponseCache,
    writeCache: (cacheKey, payload, ttlSeconds) => writeResponseCache(cacheKey, payload, ttlSeconds, input.key, "messages"),
    record: recordLlmRequest,
    embedText: (text) => embedForSemantic(routed, text, input.fetchImpl ?? fetch),
    readSemantic: (lookup) => readSemanticCache(input.key, lookup),
    writeSemantic: (entry) => writeSemanticCache(input.key, entry),
  });
}

export async function proxyResponses(input: {
  key: GatewayKey;
  request: ResponsesRequest;
  fallbackHeader?: string | null;
  cacheTtlHeader?: string | null;
  promptCacheHeader?: string | null;
  cacheModeHeader?: string | null;
  similarityHeader?: string | null;
  fetchImpl?: typeof fetch;
}) {
  const [routed, overrides] = await Promise.all([
    loadRoutedProviders(input.key.organizationId),
    orgPriceOverrides(input.key.organizationId),
  ]);
  return handleResponses({
    key: input.key,
    request: input.request,
    fallbackHeader: input.fallbackHeader ?? null,
    cacheTtlHeader: input.cacheTtlHeader ?? null,
    promptCacheHeader: input.promptCacheHeader,
    cacheModeHeader: input.cacheModeHeader,
    similarityHeader: input.similarityHeader,
    providers: routed,
    overrides,
    fetchImpl: input.fetchImpl ?? fetch,
    consumeRateLimit: () => consumeRateLimit(input.key),
    readCache: readResponseCache,
    writeCache: (cacheKey, payload, ttlSeconds) => writeResponseCache(cacheKey, payload, ttlSeconds, input.key, "responses"),
    record: recordLlmRequest,
    embedText: (text) => embedForSemantic(routed, text, input.fetchImpl ?? fetch),
    readSemantic: (lookup) => readSemanticCache(input.key, lookup),
    writeSemantic: (entry) => writeSemanticCache(input.key, entry),
  });
}

export async function proxyEmbeddings(input: {
  key: GatewayKey;
  body: { model: string; input: unknown; [key: string]: unknown };
  fallbackHeader?: string | null;
  cacheTtlHeader?: string | null;
  fetchImpl?: typeof fetch;
}) {
  const [routed, overrides] = await Promise.all([
    loadRoutedProviders(input.key.organizationId),
    orgPriceOverrides(input.key.organizationId),
  ]);
  return handleEmbeddings({
    key: input.key,
    body: input.body,
    fallbackHeader: input.fallbackHeader ?? null,
    cacheTtlHeader: input.cacheTtlHeader ?? null,
    providers: routed,
    overrides,
    fetchImpl: input.fetchImpl ?? fetch,
    consumeRateLimit: () => consumeRateLimit(input.key),
    readCache: readResponseCache,
    writeCache: (cacheKey, payload, ttlSeconds) => writeResponseCache(cacheKey, payload, ttlSeconds, input.key, "embeddings"),
    record: recordLlmRequest,
  });
}

export async function orgPriceOverrides(orgId: string): Promise<PriceOverride[]> {
  const rows = await db.query.modelPrices.findMany({
    where: eq(modelPrices.organizationId, orgId),
  });
  return rows.map((row) => ({
    model: row.model,
    inputPerMillion: Number(row.inputPerMillion),
    outputPerMillion: Number(row.outputPerMillion),
  }));
}

async function loadRoutedProviders(orgId: string): Promise<RoutedProvider[]> {
  const rows = await db.query.providers.findMany({
    where: eq(providers.organizationId, orgId),
  });
  return rows.map((row) => ({
    id: row.id,
    type: row.type as ProviderKind,
    baseUrl: row.baseUrl,
    apiKey: decryptSecret(row.encryptedApiKey),
    models: parseStringList(row.modelsJson),
    priority: row.priority,
  }));
}

async function consumeRateLimit(key: GatewayKey, now = new Date()) {
  if (key.requestsPerMinute == null) {
    return;
  }
  const windowStart = minuteWindowStart(now);
  const rows = await db
    .insert(rateLimitBuckets)
    .values({ apiKeyId: key.id, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimitBuckets.apiKeyId, rateLimitBuckets.windowStart],
      set: { count: sql`${rateLimitBuckets.count} + 1` },
    })
    .returning({ count: rateLimitBuckets.count });
  await db.delete(rateLimitBuckets).where(and(eq(rateLimitBuckets.apiKeyId, key.id), lte(rateLimitBuckets.windowStart, new Date(windowStart.getTime() - 5 * 60_000))));
  const count = rows[0]?.count ?? 1;
  if (count > key.requestsPerMinute) {
    throw new ProxyError(429, "Rate limit exceeded", undefined, {
      "Retry-After": String(retryAfterSeconds(now)),
    });
  }
}

async function readResponseCache(cacheKey: string): Promise<CachedPayload | null> {
  const now = new Date();
  await db.delete(responseCache).where(lte(responseCache.expiresAt, now));
  const row = await db.query.responseCache.findFirst({
    where: eq(responseCache.cacheKey, cacheKey),
  });
  if (!row) {
    return null;
  }
  try {
    const meta = JSON.parse(row.metaJson) as Omit<CachedPayload, "body">;
    return { ...meta, body: JSON.parse(row.bodyJson) };
  } catch {
    return null;
  }
}

async function writeResponseCache(cacheKey: string, payload: CachedPayload, ttlSeconds: number, key: GatewayKey, endpoint: string) {
  const { body, ...meta } = payload;
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  await db
    .insert(responseCache)
    .values({
      cacheKey,
      organizationId: key.organizationId,
      apiKeyId: key.id,
      endpoint,
      providerType: payload.providerType,
      model: payload.model,
      bodyJson: JSON.stringify(body),
      metaJson: JSON.stringify(meta),
      expiresAt,
    })
    .onConflictDoUpdate({
      target: responseCache.cacheKey,
      set: {
        endpoint,
        providerType: payload.providerType,
        model: payload.model,
        bodyJson: JSON.stringify(body),
        metaJson: JSON.stringify(meta),
        expiresAt,
      },
    });
}

async function recordLlmRequest(input: RequestLog) {
  await db.insert(llmRequests).values({
    id: crypto.randomUUID(),
    organizationId: input.organizationId,
    gatewayId: input.gatewayId,
    apiKeyId: input.apiKeyId,
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
    cacheKind: input.cacheKind || (input.cacheHit ? "exact" : "miss"),
    cacheReadTokens: input.cacheReadTokens || 0,
    cacheWriteTokens: input.cacheWriteTokens || 0,
    guardAction: input.guardAction || "",
    guardFindings: input.guardFindings || "[]",
    attemptsJson: input.attemptsJson,
    error: input.error,
  });
  if (input.costMicros > 0) {
    await db
      .update(apiKeys)
      .set({
        periodSpendMicros: sql`${apiKeys.periodSpendMicros} + ${input.costMicros}`,
        lastUsedAt: new Date(),
      })
      .where(and(eq(apiKeys.id, input.apiKeyId), eq(apiKeys.organizationId, input.organizationId)));
    await db
      .update(organizations)
      .set({
        periodSpendMicros: sql`${organizations.periodSpendMicros} + ${input.costMicros}`,
      })
      .where(eq(organizations.id, input.organizationId));
    if (input.gatewayId) {
      await db
        .update(gateways)
        .set({ periodSpendMicros: sql`${gateways.periodSpendMicros} + ${input.costMicros}` })
        .where(eq(gateways.id, input.gatewayId));
    }
  } else {
    await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, input.apiKeyId));
  }
}

async function embedForSemantic(providersToUse: RoutedProvider[], text: string, fetchImpl: typeof fetch) {
  const provider =
    providersToUse.find((item) => item.type === "openai" || item.type === "openai_compatible") ??
    providersToUse.find((item) => item.type === "gemini");
  if (!provider) return null;
  const model = provider.type === "gemini" ? "gemini-embedding-001" : "text-embedding-3-small";
  const base = (provider.baseUrl || defaultProviderBase(provider.type)).replace(/\/$/, "");
  try {
    const response = await fetchImpl(`${base}/embeddings`, {
      method: "POST",
      headers: { Authorization: `Bearer ${provider.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: text }),
    });
    if (!response.ok) return null;
    const json = (await response.json()) as { data?: Array<{ embedding?: number[] }>; usage?: { prompt_tokens?: number; total_tokens?: number } };
    const embedding = json.data?.[0]?.embedding;
    const tokens = json.usage?.prompt_tokens || json.usage?.total_tokens || 0;
    return {
      embedding: Array.isArray(embedding) ? embedding : null,
      costMicros: calculateCostMicros({ model, promptTokens: tokens, completionTokens: 0 }),
    };
  } catch {
    return null;
  }
}

async function readSemanticCache(key: GatewayKey, lookup: SemanticLookup) {
  const now = new Date();
  await db.delete(semanticCache).where(lte(semanticCache.expiresAt, now));
  const rows = await db.query.semanticCache.findMany({
    where: and(
      eq(semanticCache.organizationId, key.organizationId),
      eq(semanticCache.apiKeyId, key.id),
      eq(semanticCache.endpoint, lookup.endpoint),
      eq(semanticCache.model, lookup.model),
      eq(semanticCache.paramsHash, lookup.paramsHash),
    ),
    orderBy: desc(semanticCache.createdAt),
    limit: 200,
  });
  let best: { payload: CachedPayload; similarity: number } | null = null;
  for (const row of rows) {
    const embedding = JSON.parse(row.embeddingJson) as number[];
    const similarity = cosineSimilarity(lookup.embedding, embedding);
    if (similarity < lookup.threshold || (best && similarity <= best.similarity)) continue;
    const meta = JSON.parse(row.metaJson) as Omit<CachedPayload, "body">;
    best = { similarity, payload: { ...meta, body: JSON.parse(row.bodyJson) } };
  }
  return best;
}

async function writeSemanticCache(key: GatewayKey, entry: SemanticLookup & { payload: CachedPayload; ttlSeconds: number }) {
  const { body, ...meta } = entry.payload;
  await db.insert(semanticCache).values({
    id: crypto.randomUUID(),
    organizationId: key.organizationId,
    apiKeyId: key.id,
    endpoint: entry.endpoint,
    model: entry.model,
    paramsHash: entry.paramsHash,
    embeddingJson: JSON.stringify(entry.embedding),
    bodyJson: JSON.stringify(body),
    metaJson: JSON.stringify(meta),
    expiresAt: new Date(Date.now() + entry.ttlSeconds * 1000),
  });
}

function parseStringList(raw: string) {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function sameMonth(a: Date, b: Date) {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth();
}

function startOfMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}
