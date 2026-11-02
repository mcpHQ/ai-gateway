export type ChatMessage = {
  role: string;
  content?: unknown;
  name?: string;
  tool_calls?: unknown;
  tool_call_id?: string;
};

export type ChatCompletionRequest = {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  tools?: Array<{
    type: string;
    function?: { name: string; description?: string; parameters?: unknown };
  }>;
  stream_options?: { include_usage?: boolean };
  [key: string]: unknown;
};

export type Usage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

function textFromContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (part && typeof part === "object" && "text" in part) {
          return String((part as { text?: string }).text ?? "");
        }
        return "";
      })
      .join("");
  }
  return "";
}

export function splitSystemMessages(messages: ChatMessage[]) {
  const systemParts: string[] = [];
  const rest: ChatMessage[] = [];
  for (const message of messages) {
    if (message.role === "system") {
      systemParts.push(textFromContent(message.content));
    } else {
      rest.push(message);
    }
  }
  return { system: systemParts.filter(Boolean).join("\n\n"), messages: rest };
}

export function toAnthropicMessages(messages: ChatMessage[]) {
  const { system, messages: rest } = splitSystemMessages(messages);
  const mapped = rest.map((message) => {
    const role = message.role === "assistant" ? "assistant" : "user";
    if (message.role === "tool") {
      return {
        role: "user" as const,
        content: [
          {
            type: "tool_result",
            tool_use_id: message.tool_call_id || "tool",
            content: textFromContent(message.content),
          },
        ],
      };
    }
    if (message.role === "assistant" && Array.isArray(message.tool_calls) && message.tool_calls.length) {
      const blocks: unknown[] = [];
      const text = textFromContent(message.content);
      if (text) {
        blocks.push({ type: "text", text });
      }
      for (const call of message.tool_calls as Array<{ id?: string; function?: { name?: string; arguments?: string } }>) {
        blocks.push({
          type: "tool_use",
          id: call.id || "tool",
          name: call.function?.name || "tool",
          input: safeJson(call.function?.arguments),
        });
      }
      return { role: "assistant" as const, content: blocks };
    }
    return {
      role,
      content: textFromContent(message.content) || " ",
    };
  });
  return { system, messages: mapped };
}

export function toAnthropicTools(tools: ChatCompletionRequest["tools"]) {
  if (!tools?.length) {
    return undefined;
  }
  return tools
    .filter((tool) => tool.function?.name)
    .map((tool) => ({
      name: tool.function!.name,
      description: tool.function?.description || "",
      input_schema: tool.function?.parameters || { type: "object", properties: {} },
    }));
}

export function anthropicToOpenAIResponse(body: {
  id?: string;
  model?: string;
  content?: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>;
  stop_reason?: string | null;
  usage?: { input_tokens?: number; output_tokens?: number };
}) {
  const text = (body.content || [])
    .filter((block) => block.type === "text")
    .map((block) => block.text || "")
    .join("");
  const toolCalls = (body.content || [])
    .filter((block) => block.type === "tool_use")
    .map((block) => ({
      id: block.id || "tool",
      type: "function",
      function: {
        name: block.name || "tool",
        arguments: JSON.stringify(block.input ?? {}),
      },
    }));
  const prompt = body.usage?.input_tokens ?? 0;
  const completion = body.usage?.output_tokens ?? 0;
  return {
    id: body.id || "chatcmpl-anthropic",
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: body.model || "claude",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: text || null,
          tool_calls: toolCalls.length ? toolCalls : undefined,
        },
        finish_reason: body.stop_reason === "tool_use" ? "tool_calls" : "stop",
      },
    ],
    usage: {
      prompt_tokens: prompt,
      completion_tokens: completion,
      total_tokens: prompt + completion,
    } satisfies Usage,
  };
}

export function anthropicUsageFromSse(payload: string) {
  let promptTokens = 0;
  let completionTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  for (const line of payload.split("\n")) {
    if (!line.startsWith("data:")) {
      continue;
    }
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") {
      continue;
    }
    try {
      const event = JSON.parse(data) as {
        type?: string;
        message?: { usage?: AnthropicUsage };
        usage?: AnthropicUsage;
      };
      const usage = event.message?.usage || event.usage;
      if (usage?.input_tokens) promptTokens = usage.input_tokens;
      if (usage?.output_tokens) completionTokens = usage.output_tokens;
      if (usage?.cache_read_input_tokens) cacheReadTokens = usage.cache_read_input_tokens;
      if (usage?.cache_creation_input_tokens) cacheWriteTokens = usage.cache_creation_input_tokens;
    } catch {
      // ignore malformed SSE lines
    }
  }
  return { promptTokens, completionTokens, cacheReadTokens, cacheWriteTokens };
}

type AnthropicUsage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
};

export function anthropicSseToOpenAI(payload: string, model: string) {
  const id = `chatcmpl-${Date.now()}`;
  const chunks: string[] = [];
  for (const line of payload.split("\n")) {
    if (!line.startsWith("data:")) {
      continue;
    }
    const data = line.slice(5).trim();
    if (!data) {
      continue;
    }
    try {
      const event = JSON.parse(data) as {
        type?: string;
        delta?: { type?: string; text?: string };
      };
      if (event.type === "content_block_delta" && event.delta?.text) {
        chunks.push(
          `data: ${JSON.stringify({
            id,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [{ index: 0, delta: { content: event.delta.text }, finish_reason: null }],
          })}`,
        );
      }
    } catch {
      // ignore
    }
  }
  chunks.push("data: [DONE]");
  return chunks.join("\n\n") + "\n\n";
}

function safeJson(value?: string) {
  if (!value) {
    return {};
  }
  try {
    return JSON.parse(value);
  } catch {
    return { raw: value };
  }
}

export function estimatePromptTokens(messages: ChatMessage[]) {
  return messages.reduce((sum, message) => sum + Math.ceil(textFromContent(message.content).length / 4), 0);
}
