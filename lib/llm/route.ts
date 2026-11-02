import { inferProvider, stripProviderPrefix } from "@/lib/cost/catalog";
import type { PlannedAttempt, RoutedProvider } from "@/lib/llm/types";

export function planAttempts(providers: RoutedProvider[], model: string, fallbacks: string[]): PlannedAttempt[] {
  const requestedModels = [model, ...fallbacks.filter((item) => item && item !== model)];
  const attempts: PlannedAttempt[] = [];
  requestedModels.forEach((requestedModel, modelStep) => {
    const kind = inferProvider(requestedModel);
    const nativeModel = stripProviderPrefix(requestedModel);
    for (const provider of rankProviders(providers, kind, nativeModel, requestedModel)) {
      attempts.push({ provider, nativeModel, modelStep, requestedModel });
    }
  });
  return attempts;
}

export function isRetryableStatus(status: number) {
  return status === 0 || status === 429 || status >= 500;
}

export function resolveFallbackModels(header: string | null, gateway: unknown, defaults: string[]) {
  if (header && header.trim()) {
    return header
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  const fromBody = fallbacksFromGateway(gateway);
  if (fromBody) {
    return fromBody;
  }
  return defaults;
}

export function resolveRequestCacheTtl(header: string | null, gateway: unknown) {
  if (header && header.trim()) {
    const parsed = Number(header);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return cacheTtlFromGateway(gateway);
}

export function withoutGateway<T extends Record<string, unknown>>(body: T) {
  const clone = { ...body };
  delete clone.gateway;
  return clone;
}

function rankProviders(providers: RoutedProvider[], kind: PlannedAttempt["provider"]["type"], nativeModel: string, requestedModel: string) {
  const ranked = [...providers].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  const sameType = ranked.filter((provider) => provider.type === kind);
  const listed = ranked.filter(
    (provider) => provider.type !== kind && (provider.models.includes(nativeModel) || provider.models.includes(requestedModel)),
  );
  return [...sameType, ...listed];
}

function fallbacksFromGateway(value: unknown) {
  if (!value || typeof value !== "object" || !("fallbacks" in value)) {
    return null;
  }
  const fallbacks = (value as { fallbacks?: unknown }).fallbacks;
  if (!Array.isArray(fallbacks)) {
    return null;
  }
  return fallbacks.map((item) => String(item).trim()).filter(Boolean);
}

function cacheTtlFromGateway(value: unknown) {
  if (!value || typeof value !== "object" || !("cache_ttl" in value)) {
    return null;
  }
  const raw = (value as { cache_ttl?: unknown }).cache_ttl;
  if (raw == null || raw === "") {
    return null;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}
