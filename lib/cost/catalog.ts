export type ProviderKind = "openai" | "anthropic" | "gemini" | "openai_compatible";
export type ModelKind = "chat" | "embedding";

export type ModelPrice = {
  id: string;
  provider: ProviderKind;
  displayName: string;
  inputPerMillion: number;
  outputPerMillion: number;
  kind: ModelKind;
};

export const MODEL_PRICES: ModelPrice[] = [
  { id: "gpt-4o", provider: "openai", displayName: "GPT-4o", inputPerMillion: 2.5, outputPerMillion: 10, kind: "chat" },
  { id: "gpt-4o-mini", provider: "openai", displayName: "GPT-4o mini", inputPerMillion: 0.15, outputPerMillion: 0.6, kind: "chat" },
  { id: "gpt-4.1", provider: "openai", displayName: "GPT-4.1", inputPerMillion: 2, outputPerMillion: 8, kind: "chat" },
  { id: "gpt-4.1-mini", provider: "openai", displayName: "GPT-4.1 mini", inputPerMillion: 0.4, outputPerMillion: 1.6, kind: "chat" },
  { id: "gpt-4.1-nano", provider: "openai", displayName: "GPT-4.1 nano", inputPerMillion: 0.1, outputPerMillion: 0.4, kind: "chat" },
  { id: "gpt-5", provider: "openai", displayName: "GPT-5", inputPerMillion: 1.25, outputPerMillion: 10, kind: "chat" },
  { id: "gpt-5-mini", provider: "openai", displayName: "GPT-5 mini", inputPerMillion: 0.25, outputPerMillion: 2, kind: "chat" },
  { id: "o3", provider: "openai", displayName: "o3", inputPerMillion: 2, outputPerMillion: 8, kind: "chat" },
  { id: "o3-mini", provider: "openai", displayName: "o3-mini", inputPerMillion: 1.1, outputPerMillion: 4.4, kind: "chat" },
  { id: "o4-mini", provider: "openai", displayName: "o4-mini", inputPerMillion: 1.1, outputPerMillion: 4.4, kind: "chat" },
  { id: "text-embedding-3-small", provider: "openai", displayName: "Embedding 3 small", inputPerMillion: 0.02, outputPerMillion: 0, kind: "embedding" },
  { id: "text-embedding-3-large", provider: "openai", displayName: "Embedding 3 large", inputPerMillion: 0.13, outputPerMillion: 0, kind: "embedding" },
  { id: "claude-opus-4-1", provider: "anthropic", displayName: "Claude Opus 4.1", inputPerMillion: 15, outputPerMillion: 75, kind: "chat" },
  { id: "claude-opus-4", provider: "anthropic", displayName: "Claude Opus 4", inputPerMillion: 15, outputPerMillion: 75, kind: "chat" },
  { id: "claude-sonnet-4-5", provider: "anthropic", displayName: "Claude Sonnet 4.5", inputPerMillion: 3, outputPerMillion: 15, kind: "chat" },
  { id: "claude-sonnet-4", provider: "anthropic", displayName: "Claude Sonnet 4", inputPerMillion: 3, outputPerMillion: 15, kind: "chat" },
  { id: "claude-3-7-sonnet-latest", provider: "anthropic", displayName: "Claude Sonnet 3.7", inputPerMillion: 3, outputPerMillion: 15, kind: "chat" },
  { id: "claude-haiku-4-5", provider: "anthropic", displayName: "Claude Haiku 4.5", inputPerMillion: 1, outputPerMillion: 5, kind: "chat" },
  { id: "claude-3-5-haiku-latest", provider: "anthropic", displayName: "Claude Haiku 3.5", inputPerMillion: 0.8, outputPerMillion: 4, kind: "chat" },
  { id: "gemini-3.8-flash", provider: "gemini", displayName: "Gemini 3.8 Flash", inputPerMillion: 0.75, outputPerMillion: 3.75, kind: "chat" },
  { id: "gemini-3.5-flash", provider: "gemini", displayName: "Gemini 3.5 Flash", inputPerMillion: 1.5, outputPerMillion: 9, kind: "chat" },
  { id: "gemini-3.1-flash-lite", provider: "gemini", displayName: "Gemini 3.1 Flash-Lite", inputPerMillion: 0.25, outputPerMillion: 1.5, kind: "chat" },
  { id: "gemini-embedding-001", provider: "gemini", displayName: "Gemini Embedding", inputPerMillion: 0.15, outputPerMillion: 0, kind: "embedding" },
  { id: "deepseek-chat", provider: "openai_compatible", displayName: "DeepSeek Chat", inputPerMillion: 0.27, outputPerMillion: 1.1, kind: "chat" },
  { id: "deepseek-reasoner", provider: "openai_compatible", displayName: "DeepSeek Reasoner", inputPerMillion: 0.55, outputPerMillion: 2.19, kind: "chat" },
  { id: "llama-3.3-70b-versatile", provider: "openai_compatible", displayName: "Llama 3.3 70B", inputPerMillion: 0.59, outputPerMillion: 0.79, kind: "chat" },
  { id: "llama-3.1-8b-instant", provider: "openai_compatible", displayName: "Llama 3.1 8B", inputPerMillion: 0.05, outputPerMillion: 0.08, kind: "chat" },
];

const byId = new Map(MODEL_PRICES.map((model) => [model.id, model]));

export type PriceOverride = {
  model: string;
  inputPerMillion: number;
  outputPerMillion: number;
};

export function findModelPrice(model: string, overrides: PriceOverride[] = []) {
  const override = overrides.find((item) => item.model === model);
  const catalog = byId.get(stripProviderPrefix(model)) ?? byId.get(model);
  if (override) {
    return {
      id: model,
      provider: catalog?.provider ?? inferProvider(model),
      displayName: catalog?.displayName ?? model,
      inputPerMillion: override.inputPerMillion,
      outputPerMillion: override.outputPerMillion,
      kind: catalog?.kind ?? "chat",
    } satisfies ModelPrice;
  }
  if (catalog) {
    return catalog;
  }
  return {
    id: model,
    provider: inferProvider(model),
    displayName: model,
    inputPerMillion: 1,
    outputPerMillion: 3,
    kind: "chat" as const,
  };
}

export function stripProviderPrefix(model: string) {
  const slash = model.indexOf("/");
  if (slash <= 0) {
    return model;
  }
  return model.slice(slash + 1);
}

export function inferProvider(model: string): ProviderKind {
  const slash = model.indexOf("/");
  if (slash > 0) {
    const prefix = model.slice(0, slash);
    if (prefix === "openai" || prefix === "anthropic" || prefix === "gemini" || prefix === "openai_compatible") {
      return prefix;
    }
    if (prefix === "google") {
      return "gemini";
    }
  }
  const id = stripProviderPrefix(model);
  if (id.startsWith("claude")) {
    return "anthropic";
  }
  if (id.startsWith("gemini")) {
    return "gemini";
  }
  if (
    id.startsWith("gpt") ||
    id.startsWith("o1") ||
    id.startsWith("o3") ||
    id.startsWith("o4") ||
    id.startsWith("text-embedding") ||
    id.startsWith("davinci")
  ) {
    return "openai";
  }
  return "openai_compatible";
}

export function estimateTokensFromText(text: string) {
  if (!text) {
    return 0;
  }
  return Math.ceil(text.length / 4);
}

export function calculateCostMicros(input: {
  model: string;
  promptTokens: number;
  completionTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  promptIncludesCacheRead?: boolean;
  overrides?: PriceOverride[];
}) {
  const price = findModelPrice(input.model, input.overrides);
  const read = Math.max(0, input.cacheReadTokens ?? 0);
  const write = Math.max(0, input.cacheWriteTokens ?? 0);
  const readRate = price.provider === "openai" || price.provider === "openai_compatible" ? 0.5 : 0.1;
  const writeRate = price.provider === "anthropic" ? 1.25 : 1;
  const uncached = Math.max(0, input.promptTokens - (input.promptIncludesCacheRead ? read : 0));
  const dollars =
    (uncached / 1_000_000) * price.inputPerMillion +
    (write / 1_000_000) * price.inputPerMillion * writeRate +
    (read / 1_000_000) * price.inputPerMillion * readRate +
    (input.completionTokens / 1_000_000) * price.outputPerMillion;
  return Math.round(dollars * 1_000_000);
}

export function microsToUsd(micros: number) {
  return micros / 1_000_000;
}

export function formatUsd(micros: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(microsToUsd(micros));
}
