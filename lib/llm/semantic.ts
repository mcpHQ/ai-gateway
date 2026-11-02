import { createHash } from "node:crypto";
import type { CachedPayload } from "@/lib/llm/types";

export type SemanticLookup = {
  endpoint: string;
  model: string;
  paramsHash: string;
  embedding: number[];
  threshold: number;
};

export function resolveCacheMode(header: string | null, gateway: unknown, orgDefault: string | null | undefined) {
  const raw = header?.trim() || stringField(gateway, "cache_mode") || orgDefault || "exact";
  return raw.toLowerCase() === "semantic" ? "semantic" : "exact";
}

export function resolveSimilarity(header: string | null, gateway: unknown, orgDefault: number | null | undefined) {
  const raw = header?.trim() || stringField(gateway, "similarity");
  const parsed = raw ? Number(raw) : orgDefault ?? 0.95;
  if (!Number.isFinite(parsed)) return 0.95;
  return Math.min(0.99, Math.max(0.8, parsed));
}

export function semanticParamsHash(input: { model: string; temperature?: unknown; maxTokens?: unknown; tools?: unknown; system?: string }) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        model: input.model,
        temperature: input.temperature ?? null,
        maxTokens: input.maxTokens ?? null,
        tools: input.tools ?? null,
        system: input.system ?? "",
      }),
    )
    .digest("hex");
}

export function semanticQueryText(messages: Array<{ role?: string; content?: unknown; tool_calls?: unknown }>) {
  if (!messages.length || messages.length > 4) return null;
  if (messages.some((message) => message.role === "tool" || hasToolContent(message))) return null;
  const users = messages.filter((message) => message.role === "user");
  if (!users.length) return null;
  const text = textOf(users[users.length - 1]?.content);
  if (!text || text.length > 24_000) return null;
  return text;
}

export async function matchSemanticCache(input: {
  enabled: boolean;
  text: string | null;
  embedText?: (text: string) => Promise<number[] | { embedding: number[] | null; costMicros: number } | null>;
  readSemantic?: (lookup: SemanticLookup) => Promise<{ payload: CachedPayload; similarity: number } | null>;
  lookup: Omit<SemanticLookup, "embedding">;
}) {
  if (!input.enabled || !input.text || !input.embedText || !input.readSemantic) {
    return { embedding: null as number[] | null, hit: null as { payload: CachedPayload; similarity: number } | null, costMicros: 0 };
  }
  const embedded = await input.embedText(input.text);
  const normalized = normalizeEmbedding(embedded);
  if (!normalized.embedding) return { embedding: null, hit: null, costMicros: normalized.costMicros };
  const hit = await input.readSemantic({ ...input.lookup, embedding: normalized.embedding });
  return { embedding: normalized.embedding, hit, costMicros: normalized.costMicros };
}

function normalizeEmbedding(value: number[] | { embedding: number[] | null; costMicros: number } | null) {
  if (!value) return { embedding: null as number[] | null, costMicros: 0 };
  if (Array.isArray(value)) return { embedding: value, costMicros: 0 };
  return { embedding: value.embedding, costMicros: value.costMicros || 0 };
}

export function cosineSimilarity(left: number[], right: number[]) {
  const length = Math.min(left.length, right.length);
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function hasToolContent(message: { content?: unknown; tool_calls?: unknown }) {
  if (message.tool_calls) return true;
  return Array.isArray(message.content) && message.content.some((part) => {
    const type = part && typeof part === "object" && "type" in part ? String((part as { type?: string }).type) : "";
    return type === "tool_use" || type === "tool_result";
  });
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "text" in part) return String((part as { text?: string }).text || "");
      return "";
    })
    .join("")
    .trim();
}

function stringField(gateway: unknown, key: string) {
  if (!gateway || typeof gateway !== "object" || !(key in gateway)) return "";
  const value = (gateway as Record<string, unknown>)[key];
  return value == null ? "" : String(value);
}
