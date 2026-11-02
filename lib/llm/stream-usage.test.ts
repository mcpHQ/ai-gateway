import { describe, expect, it } from "vitest";
import { usageFromOpenAIStream } from "./stream-usage";

describe("OpenAI stream usage", () => {
  it("reads usage from the final SSE chunk", () => {
    const payload = [
      `data: {"choices":[{"delta":{"content":"Hi"}}]}`,
      `data: {"usage":{"prompt_tokens":11,"completion_tokens":2,"total_tokens":13}}`,
      "data: [DONE]",
    ].join("\n");
    expect(usageFromOpenAIStream(payload)).toEqual({
      prompt_tokens: 11,
      completion_tokens: 2,
      total_tokens: 13,
    });
  });

  it("returns null when the provider omits usage", () => {
    expect(usageFromOpenAIStream(`data: {"choices":[{"delta":{"content":"Hi"}}]}\ndata: [DONE]\n`)).toBeNull();
  });
});
