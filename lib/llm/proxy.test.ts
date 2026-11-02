import { describe, expect, it } from "vitest";
import { handleChat } from "@/lib/llm/execute";
import { isRetryableStatus } from "@/lib/llm/route";
import { ProxyError, type CachedPayload, type GatewayKey, type RequestLog, type RoutedProvider } from "@/lib/llm/types";
import type { ChatCompletionRequest } from "@/lib/llm/anthropic";

const chatRequest: ChatCompletionRequest = {
  model: "openai/gpt-4o-mini",
  messages: [{ role: "user", content: "Hello" }],
};

function gatewayKey(overrides: Partial<GatewayKey> = {}): GatewayKey {
  return {
    id: "key-1",
    organizationId: "org-1",
    monthlyBudgetCents: null,
    periodSpendMicros: 0,
    requestsPerMinute: null,
    orgMonthlyBudgetCents: null,
    orgPeriodSpendMicros: 0,
    cacheTtlSeconds: null,
    fallbacks: [],
    ...overrides,
  };
}

function provider(overrides: Partial<RoutedProvider> & Pick<RoutedProvider, "id" | "apiKey">): RoutedProvider {
  return {
    type: "openai",
    baseUrl: null,
    models: [],
    priority: 0,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function headerValue(init: RequestInit | undefined, name: string) {
  const headers = init?.headers;
  if (!headers || headers instanceof Headers || Array.isArray(headers)) {
    return headers instanceof Headers ? headers.get(name) : undefined;
  }
  const match = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return match?.[1];
}

function harness(fetchImpl: (url: string, init: RequestInit | undefined, call: number) => Response | Promise<Response>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const records: RequestLog[] = [];
  const cache = new Map<string, CachedPayload>();
  let writes = 0;
  return {
    calls,
    records,
    get writes() {
      return writes;
    },
    seed(payload: CachedPayload) {
      cache.set("seed", payload);
    },
    async chat(input: {
      key?: GatewayKey;
      request?: ChatCompletionRequest;
      providers: RoutedProvider[];
      fallbackHeader?: string | null;
      cacheTtlHeader?: string | null;
      consumeRateLimit?: () => Promise<void>;
      readCache?: (cacheKey: string) => Promise<CachedPayload | null>;
    }) {
      return handleChat({
        key: input.key ?? gatewayKey(),
        request: input.request ?? chatRequest,
        fallbackHeader: input.fallbackHeader ?? null,
        cacheTtlHeader: input.cacheTtlHeader ?? null,
        providers: input.providers,
        overrides: [],
        fetchImpl: (async (url, init) => {
          calls.push({ url: String(url), init });
          return fetchImpl(String(url), init, calls.length);
        }) as typeof fetch,
        consumeRateLimit: input.consumeRateLimit ?? (async () => {}),
        readCache:
          input.readCache ??
          (async (cacheKey) => {
            return cache.get(cacheKey) ?? null;
          }),
        writeCache: async (cacheKey, payload) => {
          writes += 1;
          cache.set(cacheKey, payload);
        },
        record: async (row) => {
          records.push(row);
        },
      });
    },
  };
}

describe("gateway proxy", () => {
  it("tries providers in priority order", async () => {
    const gate = harness(async () => jsonResponse({ usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 } }));
    await gate.chat({
      providers: [
        provider({ id: "later", apiKey: "sk-later", priority: 10 }),
        provider({ id: "first", apiKey: "sk-first", priority: 1 }),
      ],
    });
    expect(gate.calls).toHaveLength(1);
    expect(headerValue(gate.calls[0].init, "authorization")).toBe("Bearer sk-first");
  });

  it("falls through to the next model after a retryable provider failure", async () => {
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(500)).toBe(true);
    const gate = harness(async (url) => {
      if (url.includes("anthropic.com")) {
        return jsonResponse({
          id: "msg_1",
          model: "claude-haiku-4-5",
          content: [{ type: "text", text: "ok" }],
          usage: { input_tokens: 4, output_tokens: 2 },
        });
      }
      return jsonResponse({ error: { message: "overloaded" } }, 500);
    });
    const response = await gate.chat({
      providers: [
        provider({ id: "openai", apiKey: "sk-openai" }),
        provider({ id: "anthropic", apiKey: "sk-anthropic", type: "anthropic" }),
      ],
      fallbackHeader: "anthropic/claude-haiku-4-5",
    });
    expect(gate.calls.filter((call) => call.url.includes("api.openai.com"))).toHaveLength(2);
    expect(gate.calls.filter((call) => call.url.includes("anthropic.com"))).toHaveLength(1);
    expect(response.headers.get("x-ai-gateway-provider")).toBe("anthropic");
    expect(response.headers.get("x-ai-gateway-model")).toBe("claude-haiku-4-5");
    expect(response.headers.get("x-ai-gateway-attempt")).toBe("1");
  });

  it("sends Gemini chat models to Google's OpenAI-compatible endpoint", async () => {
    const gate = harness(async () =>
      jsonResponse({
        choices: [{ message: { role: "assistant", content: "Hi" } }],
        usage: { prompt_tokens: 8, completion_tokens: 2, total_tokens: 10 },
      }),
    );
    const response = await gate.chat({
      request: { model: "gemini/gemini-3.5-flash", messages: [{ role: "user", content: "Hello" }] },
      providers: [provider({ id: "gemini", apiKey: "AIza-test", type: "gemini" })],
    });
    expect(gate.calls[0]?.url).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    expect(headerValue(gate.calls[0]?.init, "authorization")).toBe("Bearer AIza-test");
    expect(JSON.parse(String(gate.calls[0]?.init?.body)).model).toBe("gemini-3.5-flash");
    expect(response.headers.get("x-ai-gateway-provider")).toBe("gemini");
  });

  it("does not fall through after a non-retryable 400", async () => {
    const gate = harness(async () => jsonResponse({ error: { message: "bad request" } }, 400));
    await expect(
      gate.chat({
        providers: [
          provider({ id: "openai", apiKey: "sk-openai" }),
          provider({ id: "anthropic", apiKey: "sk-anthropic", type: "anthropic" }),
        ],
        fallbackHeader: "anthropic/claude-haiku-4-5",
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(gate.calls).toHaveLength(1);
  });

  it("serves an identical non-stream request from cache with zero cost", async () => {
    const gate = harness(async () =>
      jsonResponse({ usage: { prompt_tokens: 1_000_000, completion_tokens: 1_000_000, total_tokens: 2_000_000 } }),
    );
    const first = await gate.chat({
      providers: [provider({ id: "openai", apiKey: "sk-openai" })],
      cacheTtlHeader: "60",
    });
    const second = await gate.chat({
      providers: [provider({ id: "openai", apiKey: "sk-openai" })],
      cacheTtlHeader: "60",
    });
    expect(gate.calls).toHaveLength(1);
    expect(first.headers.get("x-ai-gateway-cache")).toBe("MISS");
    expect(second.headers.get("x-ai-gateway-cache")).toBe("HIT");
    expect(gate.records[0]?.costMicros).toBeGreaterThan(0);
    expect(gate.records[1]?.costMicros).toBe(0);
    expect(gate.records[1]?.cacheHit).toBe(true);
  });

  it("does not serve a stream from cache", async () => {
    const gate = harness(async () => new Response("data: [DONE]\n\n", { status: 200, headers: { "Content-Type": "text/event-stream" } }));
    const response = await gate.chat({
      providers: [provider({ id: "openai", apiKey: "sk-openai" })],
      cacheTtlHeader: "120",
      request: { ...chatRequest, stream: true },
      readCache: async () => ({
        body: { cached: true },
        providerId: "openai",
        providerType: "openai",
        model: "gpt-4o-mini",
        attempt: 0,
        promptTokens: 1,
        completionTokens: 1,
        usageSource: "provider",
      }),
    });
    expect(gate.calls).toHaveLength(1);
    expect(gate.writes).toBe(0);
    expect(response.headers.get("x-ai-gateway-cache")).toBe("MISS");
  });

  it("returns 429 before calling upstream when the key is over its rate limit", async () => {
    const gate = harness(async () => jsonResponse({}));
    await expect(
      gate.chat({
        providers: [provider({ id: "openai", apiKey: "sk-openai" })],
        consumeRateLimit: async () => {
          throw new ProxyError(429, "Rate limit exceeded");
        },
      }),
    ).rejects.toMatchObject({ status: 429 });
    expect(gate.calls).toHaveLength(0);
  });

  it("returns 402 before calling upstream when a key or organization budget is spent", async () => {
    const providers = [provider({ id: "openai", apiKey: "sk-openai" })];
    const spentKey = harness(async () => jsonResponse({}));
    await expect(
      spentKey.chat({
        providers,
        key: gatewayKey({ monthlyBudgetCents: 100, periodSpendMicros: 1_000_000 }),
      }),
    ).rejects.toMatchObject({ status: 402 });
    expect(spentKey.calls).toHaveLength(0);

    const spentOrg = harness(async () => jsonResponse({}));
    await expect(
      spentOrg.chat({
        providers,
        key: gatewayKey({ orgMonthlyBudgetCents: 100, orgPeriodSpendMicros: 1_000_000 }),
      }),
    ).rejects.toMatchObject({ status: 402 });
    expect(spentOrg.calls).toHaveLength(0);
  });
});
