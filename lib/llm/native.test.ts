import { describe, expect, it } from "vitest";
import { handleMessages, handleResponses } from "./native";
import { ProxyError, type CachedPayload, type GatewayKey, type RequestLog, type RoutedProvider } from "./types";

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

function provider(overrides: Partial<RoutedProvider> & Pick<RoutedProvider, "id" | "type" | "apiKey">): RoutedProvider {
  return { baseUrl: null, models: [], priority: 0, ...overrides };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function harness(fetchImpl: (url: string, init: RequestInit | undefined) => Response | Promise<Response>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const records: RequestLog[] = [];
  const cache = new Map<string, CachedPayload>();
  const deps = {
    fetchImpl: (async (url, init) => {
      calls.push({ url: String(url), init });
      return fetchImpl(String(url), init);
    }) as typeof fetch,
    consumeRateLimit: async () => {},
    readCache: async (cacheKey: string) => cache.get(cacheKey) ?? null,
    writeCache: async (cacheKey: string, payload: CachedPayload) => {
      cache.set(cacheKey, payload);
    },
    record: async (row: RequestLog) => {
      records.push(row);
    },
  };
  return { calls, records, deps };
}

describe("native gateway APIs", () => {
  it("passes Anthropic messages through to an Anthropic provider", async () => {
    const gate = harness(async () =>
      jsonResponse({
        id: "msg_1",
        type: "message",
        role: "assistant",
        model: "claude-haiku-4-5",
        content: [{ type: "text", text: "Hi" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 4, output_tokens: 1 },
      }),
    );
    const response = await handleMessages({
      ...gate.deps,
      key: gatewayKey(),
      request: { model: "anthropic/claude-haiku-4-5", messages: [{ role: "user", content: "Hello" }], max_tokens: 16 },
      fallbackHeader: null,
      cacheTtlHeader: null,
      anthropicVersion: "2023-06-01",
      providers: [provider({ id: "anthropic", type: "anthropic", apiKey: "sk-ant" })],
      overrides: [],
    });
    const body = await response.json();
    expect(gate.calls[0]?.url).toBe("https://api.anthropic.com/v1/messages");
    expect(body.content[0].text).toBe("Hi");
    expect(response.headers.get("x-ai-gateway-provider")).toBe("anthropic");
  });

  it("translates a Messages fallback onto an OpenAI chat completion", async () => {
    const gate = harness(async (url) => {
      if (url.includes("openai.com")) {
        return jsonResponse({
          id: "chatcmpl-1",
          choices: [{ finish_reason: "stop", message: { role: "assistant", content: "Hi" } }],
          usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 },
        });
      }
      return jsonResponse({ error: { message: "overloaded" } }, 500);
    });
    const response = await handleMessages({
      ...gate.deps,
      key: gatewayKey(),
      request: { model: "anthropic/claude-haiku-4-5", messages: [{ role: "user", content: "Hello" }], max_tokens: 16 },
      fallbackHeader: "openai/gpt-4o-mini",
      cacheTtlHeader: null,
      anthropicVersion: null,
      providers: [
        provider({ id: "anthropic", type: "anthropic", apiKey: "sk-ant" }),
        provider({ id: "openai", type: "openai", apiKey: "sk-openai" }),
      ],
      overrides: [],
    });
    const body = await response.json();
    expect(gate.calls.filter((call) => call.url.includes("anthropic.com"))).toHaveLength(2);
    expect(gate.calls.some((call) => call.url.endsWith("/chat/completions"))).toBe(true);
    expect(body.type).toBe("message");
    expect(body.content[0].text).toBe("Hi");
    expect(response.headers.get("x-ai-gateway-attempt")).toBe("1");
  });

  it("passes Responses through to OpenAI and translates an Anthropic fallback", async () => {
    const passthrough = harness(async () =>
      jsonResponse({
        id: "resp_1",
        object: "response",
        status: "completed",
        model: "gpt-4o-mini",
        output: [{ type: "message", content: [{ type: "output_text", text: "Hi" }] }],
        usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 },
      }),
    );
    const direct = await handleResponses({
      ...passthrough.deps,
      key: gatewayKey(),
      request: { model: "openai/gpt-4o-mini", input: "Hello" },
      fallbackHeader: null,
      cacheTtlHeader: null,
      providers: [provider({ id: "openai", type: "openai", apiKey: "sk-openai" })],
      overrides: [],
    });
    expect(passthrough.calls[0]?.url).toBe("https://api.openai.com/v1/responses");
    expect((await direct.json()).object).toBe("response");

    const translated = harness(async () =>
      jsonResponse({
        id: "msg_1",
        type: "message",
        role: "assistant",
        model: "claude-haiku-4-5",
        content: [{ type: "text", text: "Hi" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 2, output_tokens: 1 },
      }),
    );
    const response = await handleResponses({
      ...translated.deps,
      key: gatewayKey(),
      request: { model: "anthropic/claude-haiku-4-5", input: "Hello", instructions: "Be brief" },
      fallbackHeader: null,
      cacheTtlHeader: null,
      providers: [provider({ id: "anthropic", type: "anthropic", apiKey: "sk-ant" })],
      overrides: [],
    });
    const body = await response.json();
    expect(translated.calls[0]?.url).toBe("https://api.anthropic.com/v1/messages");
    expect(body.object).toBe("response");
    expect(body.output[0].content[0].text).toBe("Hi");
  });

  it("translates a Responses call onto Gemini chat completions", async () => {
    const gate = harness(async () =>
      jsonResponse({
        id: "chatcmpl-1",
        choices: [{ finish_reason: "stop", message: { role: "assistant", content: "Hi" } }],
        usage: { prompt_tokens: 4, completion_tokens: 1, total_tokens: 5 },
      }),
    );
    const response = await handleResponses({
      ...gate.deps,
      key: gatewayKey(),
      request: { model: "gemini/gemini-3.5-flash", input: "Hello" },
      fallbackHeader: null,
      cacheTtlHeader: null,
      providers: [provider({ id: "gemini", type: "gemini", apiKey: "AIza-test" })],
      overrides: [],
    });
    const body = await response.json();
    expect(gate.calls[0]?.url).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    expect(body.object).toBe("response");
    expect(body.output[0].content[0].text).toBe("Hi");
  });

  it("serves a repeated Messages call from cache with zero cost", async () => {
    const gate = harness(async () =>
      jsonResponse({
        id: "msg_1",
        type: "message",
        role: "assistant",
        content: [{ type: "text", text: "Hi" }],
        usage: { input_tokens: 1_000_000, output_tokens: 1_000_000 },
      }),
    );
    const request = { model: "anthropic/claude-haiku-4-5", messages: [{ role: "user", content: "Hello" }], max_tokens: 8 };
    const providers = [provider({ id: "anthropic", type: "anthropic", apiKey: "sk-ant" })];
    await handleMessages({ ...gate.deps, key: gatewayKey(), request, fallbackHeader: null, cacheTtlHeader: "60", anthropicVersion: null, providers, overrides: [] });
    const second = await handleMessages({ ...gate.deps, key: gatewayKey(), request, fallbackHeader: null, cacheTtlHeader: "60", anthropicVersion: null, providers, overrides: [] });
    expect(gate.calls).toHaveLength(1);
    expect(second.headers.get("x-ai-gateway-cache")).toBe("HIT");
    expect(gate.records[1]?.costMicros).toBe(0);
  });

  it("stops before upstream when the budget is spent", async () => {
    const gate = harness(async () => jsonResponse({}));
    await expect(
      handleResponses({
        ...gate.deps,
        key: gatewayKey({ monthlyBudgetCents: 100, periodSpendMicros: 1_000_000 }),
        request: { model: "openai/gpt-4o-mini", input: "Hello" },
        fallbackHeader: null,
        cacheTtlHeader: null,
        providers: [provider({ id: "openai", type: "openai", apiKey: "sk-openai" })],
        overrides: [],
      }),
    ).rejects.toBeInstanceOf(ProxyError);
    expect(gate.calls).toHaveLength(0);
  });
});
