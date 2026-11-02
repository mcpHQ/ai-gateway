import { describe, expect, it } from "vitest";
import { applyAnthropicPromptCache } from "./prompt-cache";
import { cosineSimilarity, semanticQueryText } from "./semantic";
import { handleChat } from "./execute";
import type { GatewayKey, RoutedProvider } from "./types";

describe("prompt cache markers", () => {
  it("marks the last message and the message before the last user message", () => {
    const marked = applyAnthropicPromptCache(
      {
        system: "Stay brief",
        messages: [
          { role: "user", content: "First" },
          { role: "assistant", content: "Ok" },
          { role: "user", content: "Second" },
        ],
      },
      true,
    );
    const assistant = marked.messages?.[1]?.content as unknown as Array<{ cache_control?: { type: string } }>;
    const last = marked.messages?.[2]?.content as unknown as Array<{ cache_control?: { type: string } }>;
    expect(assistant[0]?.cache_control).toEqual({ type: "ephemeral" });
    expect(last[0]?.cache_control).toEqual({ type: "ephemeral" });
    expect(marked.system).toBe("Stay brief");
  });

  it("marks the system prompt when the conversation has no earlier message", () => {
    const marked = applyAnthropicPromptCache({ system: "Stay brief", messages: [{ role: "user", content: "Hi" }] }, true);
    expect(marked.system).toEqual([{ type: "text", text: "Stay brief", cache_control: { type: "ephemeral" } }]);
  });
});

describe("semantic cache", () => {
  it("scores identical vectors as 1 and skips tool traffic", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    expect(semanticQueryText([{ role: "user", content: "Hello" }])).toBe("Hello");
    expect(semanticQueryText([{ role: "user", content: "Hello", tool_calls: [{}] }])).toBeNull();
  });

  it("returns a semantic hit without calling the chat provider", async () => {
    let chatCalls = 0;
    const response = await handleChat({
      key: { ...key(), cacheMode: "semantic" },
      request: { model: "openai/gpt-4o-mini", messages: [{ role: "user", content: "What is 2 plus 2?" }] },
      fallbackHeader: null,
      cacheTtlHeader: "60",
      cacheModeHeader: "semantic",
      providers: [provider()],
      overrides: [],
      fetchImpl: (async () => {
        chatCalls += 1;
        return new Response("{}", { status: 500 });
      }) as typeof fetch,
      consumeRateLimit: async () => {},
      readCache: async () => null,
      writeCache: async () => {},
      record: async () => {},
      embedText: async () => [1, 0],
      readSemantic: async () => ({
        similarity: 0.97,
        payload: {
          body: { choices: [{ message: { content: "4" } }] },
          providerId: "openai",
          providerType: "openai",
          model: "gpt-4o-mini",
          attempt: 0,
          promptTokens: 10,
          completionTokens: 1,
          usageSource: "provider",
        },
      }),
    });
    expect(chatCalls).toBe(0);
    expect(response.headers.get("x-ai-gateway-cache")).toBe("SEMANTIC");
    expect(response.headers.get("x-ai-gateway-similarity")).toBe("0.970");
  });
});

function key(): GatewayKey {
  return {
    id: "key",
    organizationId: "org",
    monthlyBudgetCents: null,
    periodSpendMicros: 0,
    requestsPerMinute: null,
    orgMonthlyBudgetCents: null,
    orgPeriodSpendMicros: 0,
    cacheTtlSeconds: null,
    fallbacks: [],
  };
}

function provider(): RoutedProvider {
  return { id: "openai", type: "openai", apiKey: "sk", baseUrl: null, models: [], priority: 0 };
}
