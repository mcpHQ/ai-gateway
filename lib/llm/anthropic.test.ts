import { describe, expect, it } from "vitest";
import {
  anthropicToOpenAIResponse,
  estimatePromptTokens,
  toAnthropicMessages,
  toAnthropicTools,
} from "./anthropic";

describe("anthropic translation", () => {
  it("extracts system messages and maps roles", () => {
    const result = toAnthropicMessages([
      { role: "system", content: "Be terse." },
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi" },
    ]);
    expect(result.system).toBe("Be terse.");
    expect(result.messages).toEqual([
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi" },
    ]);
  });

  it("maps OpenAI tools to Anthropic input_schema", () => {
    const tools = toAnthropicTools([
      {
        type: "function",
        function: {
          name: "lookup",
          description: "Find a record",
          parameters: { type: "object", properties: { id: { type: "string" } } },
        },
      },
    ]);
    expect(tools?.[0]).toMatchObject({ name: "lookup", description: "Find a record" });
  });

  it("converts Anthropic responses into OpenAI chat completions", () => {
    const result = anthropicToOpenAIResponse({
      id: "msg_1",
      model: "claude-sonnet-4-5",
      content: [{ type: "text", text: "Done" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 12, output_tokens: 3 },
    });
    expect(result.choices[0].message.content).toBe("Done");
    expect(result.usage.prompt_tokens).toBe(12);
    expect(result.usage.completion_tokens).toBe(3);
  });

  it("estimates prompt tokens from message text", () => {
    expect(estimatePromptTokens([{ role: "user", content: "abcdefgh" }])).toBe(2);
  });
});
