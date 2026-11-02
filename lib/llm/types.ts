import type { ProviderKind } from "@/lib/cost/catalog";

export class ProxyError extends Error {
  status: number;
  body: unknown;
  headers?: Record<string, string>;

  constructor(status: number, message: string, body?: unknown, headers?: Record<string, string>) {
    super(message);
    this.status = status;
    this.headers = headers;
    this.body =
      body ??
      {
        error: {
          message,
          type: status === 402 ? "budget_exceeded" : status === 429 ? "rate_limit_error" : "invalid_request_error",
        },
      };
  }
}

export type GuardAction = "off" | "flag" | "block";

export type GatewayKey = {
  id: string;
  organizationId: string;
  gatewayId?: string | null;
  monthlyBudgetCents: number | null;
  periodSpendMicros: number;
  requestsPerMinute: number | null;
  orgMonthlyBudgetCents: number | null;
  orgPeriodSpendMicros: number;
  gatewayMonthlyBudgetCents?: number | null;
  gatewayPeriodSpendMicros?: number | null;
  cacheTtlSeconds: number | null;
  cacheMode?: "exact" | "semantic" | null;
  similarityThreshold?: number | null;
  guardAction?: "off" | "flag" | "block" | null;
  fallbacks: string[];
};

export type RoutedProvider = {
  id: string;
  type: ProviderKind;
  baseUrl: string | null;
  apiKey: string;
  models: string[];
  priority: number;
};

export type PlannedAttempt = {
  provider: RoutedProvider;
  nativeModel: string;
  modelStep: number;
  requestedModel: string;
};

export type AttemptRecord = {
  providerId: string;
  providerType: string;
  model: string;
  status: number;
  durationMs: number;
  error?: string;
};

export type RequestLog = {
  organizationId: string;
  gatewayId?: string | null;
  apiKeyId: string;
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
  error?: string;
  cacheHit: boolean;
  cacheKind?: "miss" | "exact" | "semantic";
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  attemptsJson: string;
  guardAction?: string;
  guardFindings?: string;
};

export type CachedPayload = {
  body: unknown;
  providerId: string;
  providerType: string;
  model: string;
  attempt: number;
  promptTokens: number;
  completionTokens: number;
  usageSource: "provider" | "estimated";
};

export type UsageCounts = {
  promptTokens: number;
  completionTokens: number;
  usageSource: "provider" | "estimated";
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  promptIncludesCacheRead?: boolean;
};
