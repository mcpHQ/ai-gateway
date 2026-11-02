import type { ProviderKind } from "@/lib/cost/catalog";

export const OPENAI_BASE = "https://api.openai.com/v1";
export const ANTHROPIC_BASE = "https://api.anthropic.com";
export const GEMINI_OPENAI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai";

export function defaultProviderBase(type: ProviderKind) {
  if (type === "anthropic") return ANTHROPIC_BASE;
  if (type === "gemini") return GEMINI_OPENAI_BASE;
  return OPENAI_BASE;
}
