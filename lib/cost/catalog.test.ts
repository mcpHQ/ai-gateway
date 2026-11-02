import { describe, expect, it } from "vitest";
import {
  calculateCostMicros,
  estimateTokensFromText,
  findModelPrice,
  inferProvider,
  microsToUsd,
  stripProviderPrefix,
} from "./catalog";

describe("cost catalog", () => {
  it("looks up known models and applies org overrides", () => {
    expect(findModelPrice("gpt-4o-mini").inputPerMillion).toBe(0.15);
    expect(findModelPrice("anthropic/claude-sonnet-4-5").id).toBe("claude-sonnet-4-5");
    expect(
      findModelPrice("gpt-4o-mini", [{ model: "gpt-4o-mini", inputPerMillion: 0.1, outputPerMillion: 0.4 }])
        .inputPerMillion,
    ).toBe(0.1);
  });

  it("infers providers from model ids", () => {
    expect(inferProvider("gpt-4o")).toBe("openai");
    expect(inferProvider("claude-sonnet-4-5")).toBe("anthropic");
    expect(inferProvider("openai/gpt-4.1")).toBe("openai");
    expect(inferProvider("llama-3.3-70b-versatile")).toBe("openai_compatible");
    expect(inferProvider("gemini/gemini-3.5-flash")).toBe("gemini");
    expect(inferProvider("google/gemini-3.8-flash")).toBe("gemini");
    expect(inferProvider("gemini-3.1-flash-lite")).toBe("gemini");
    expect(findModelPrice("gemini-3.5-flash").inputPerMillion).toBe(1.5);
  });

  it("strips provider prefixes", () => {
    expect(stripProviderPrefix("anthropic/claude-sonnet-4-5")).toBe("claude-sonnet-4-5");
    expect(stripProviderPrefix("gpt-4o")).toBe("gpt-4o");
  });

  it("bills Anthropic cache writes at 1.25x and cache reads at 0.1x", () => {
    const full = calculateCostMicros({ model: "claude-sonnet-4-5", promptTokens: 1_000_000, completionTokens: 0 });
    const cached = calculateCostMicros({
      model: "claude-sonnet-4-5",
      promptTokens: 0,
      completionTokens: 0,
      cacheReadTokens: 1_000_000,
      cacheWriteTokens: 1_000_000,
    });
    expect(cached).toBe(Math.round(full * 0.1 + full * 1.25));
  });

  it("bills OpenAI cached input at half price without charging it twice", () => {
    const mixed = calculateCostMicros({
      model: "gpt-4o-mini",
      promptTokens: 1_000_000,
      completionTokens: 0,
      cacheReadTokens: 400_000,
      promptIncludesCacheRead: true,
    });
    const uncached = calculateCostMicros({ model: "gpt-4o-mini", promptTokens: 600_000, completionTokens: 0 });
    const cached = calculateCostMicros({ model: "gpt-4o-mini", promptTokens: 0, completionTokens: 0, cacheReadTokens: 400_000 });
    expect(mixed).toBe(uncached + cached);
  });

  it("prices tokens in micros", () => {
    const micros = calculateCostMicros({
      model: "gpt-4o-mini",
      promptTokens: 1_000_000,
      completionTokens: 500_000,
    });
    expect(microsToUsd(micros)).toBeCloseTo(0.15 + 0.3, 8);
  });

  it("estimates tokens from character length", () => {
    expect(estimateTokensFromText("abcd")).toBe(1);
    expect(estimateTokensFromText("abcdefgh")).toBe(2);
    expect(estimateTokensFromText("")).toBe(0);
  });

  it("uses a conservative fallback price for unknown models", () => {
    const price = findModelPrice("my-custom-model");
    expect(price.inputPerMillion).toBe(1);
    expect(price.outputPerMillion).toBe(3);
    expect(price.provider).toBe("openai_compatible");
  });
});
