import { describe, expect, it } from "vitest";
import { anthropicRequestToChat, anthropicToResponses, chatCompletionToAnthropic, responsesRequestToAnthropic } from "./translate";

describe("native API translation", () => {
  it("turns an Anthropic message request into a chat completion", () => {
    const chat = anthropicRequestToChat({
      model: "claude-haiku-4-5",
      max_tokens: 32,
      system: "Be brief",
      messages: [{ role: "user", content: [{ type: "text", text: "Hello" }] }],
      tools: [{ name: "lookup", description: "Look up", input_schema: { type: "object" } }],
    });
    expect(chat.messages[0]).toMatchObject({ role: "system", content: "Be brief" });
    expect(chat.messages[1]).toMatchObject({ role: "user", content: "Hello" });
    expect(chat.tools?.[0]?.function?.name).toBe("lookup");
  });

  it("turns a chat completion into an Anthropic message", () => {
    const message = chatCompletionToAnthropic(
      {
        id: "chatcmpl-1",
        choices: [{ finish_reason: "stop", message: { role: "assistant", content: "Hi" } }],
        usage: { prompt_tokens: 3, completion_tokens: 1 },
      },
      "gpt-4o-mini",
    );
    expect(message).toMatchObject({
      type: "message",
      model: "gpt-4o-mini",
      content: [{ type: "text", text: "Hi" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 3, output_tokens: 1 },
    });
  });

  it("turns a Responses request into Anthropic messages and back", () => {
    const anthropic = responsesRequestToAnthropic({
      model: "claude-haiku-4-5",
      instructions: "Be brief",
      input: "Hello",
      max_output_tokens: 16,
    });
    expect(anthropic.system).toBe("Be brief");
    expect(anthropic.messages).toEqual([{ role: "user", content: "Hello" }]);
    const response = anthropicToResponses({
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: "claude-haiku-4-5",
      content: [{ type: "text", text: "Hi" }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 2, output_tokens: 1 },
    });
    expect(response.object).toBe("response");
    expect(response.output[0]?.content).toEqual([{ type: "output_text", text: "Hi" }]);
    expect(response.usage.total_tokens).toBe(3);
  });
});
