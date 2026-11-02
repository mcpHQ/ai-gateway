import type { ChatCompletionRequest, ChatMessage } from "@/lib/llm/anthropic";

export type AnthropicMessageRequest = {
  model: string;
  messages: Array<{ role: string; content?: unknown }>;
  max_tokens?: number;
  system?: unknown;
  stream?: boolean;
  temperature?: number;
  tools?: Array<{ name?: string; description?: string; input_schema?: unknown }>;
  gateway?: unknown;
  [key: string]: unknown;
};

export type ResponsesRequest = {
  model: string;
  input?: unknown;
  instructions?: unknown;
  stream?: boolean;
  max_output_tokens?: number;
  temperature?: number;
  tools?: Array<{ type?: string; name?: string; description?: string; parameters?: unknown }>;
  gateway?: unknown;
  [key: string]: unknown;
};

type AnthropicContentBlock = {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: unknown;
};

export type AnthropicMessageResponse = {
  id: string;
  type: "message";
  role: "assistant";
  model: string;
  content: AnthropicContentBlock[];
  stop_reason: string | null;
  stop_sequence: null;
  usage: { input_tokens: number; output_tokens: number };
};

export type ResponsesObject = {
  id: string;
  object: "response";
  status: "completed";
  model: string;
  output: Array<Record<string, unknown>>;
  usage: { input_tokens: number; output_tokens: number; total_tokens: number };
};

export function anthropicRequestToChat(body: AnthropicMessageRequest): ChatCompletionRequest {
  const messages: ChatMessage[] = [];
  const system = textFromUnknown(body.system);
  if (system) messages.push({ role: "system", content: system });
  for (const message of body.messages || []) {
    messages.push(...anthropicMessageToChat(message));
  }
  const tools = (body.tools || [])
    .filter((tool) => tool.name)
    .map((tool) => ({
      type: "function",
      function: {
        name: tool.name || "tool",
        description: tool.description,
        parameters: tool.input_schema,
      },
    }));
  return {
    model: body.model,
    messages,
    max_tokens: body.max_tokens,
    temperature: body.temperature,
    stream: false,
    tools: tools.length ? tools : undefined,
  };
}

export function chatCompletionToAnthropic(body: unknown, model: string): AnthropicMessageResponse {
  const json = asRecord(body);
  const choice = asRecord(Array.isArray(json.choices) ? json.choices[0] : undefined);
  const message = asRecord(choice.message);
  const content: AnthropicContentBlock[] = [];
  const text = typeof message.content === "string" ? message.content : "";
  if (text) content.push({ type: "text", text });
  if (Array.isArray(message.tool_calls)) {
    for (const call of message.tool_calls) {
      const item = asRecord(call);
      const fn = asRecord(item.function);
      content.push({
        type: "tool_use",
        id: typeof item.id === "string" ? item.id : "tool",
        name: typeof fn.name === "string" ? fn.name : "tool",
        input: parseJson(typeof fn.arguments === "string" ? fn.arguments : "{}"),
      });
    }
  }
  const usage = asRecord(json.usage);
  const finish = typeof choice.finish_reason === "string" ? choice.finish_reason : "stop";
  return {
    id: typeof json.id === "string" ? json.id : "msg_gateway",
    type: "message",
    role: "assistant",
    model,
    content,
    stop_reason: finish === "tool_calls" ? "tool_use" : finish === "length" ? "max_tokens" : "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: numberFrom(usage.prompt_tokens),
      output_tokens: numberFrom(usage.completion_tokens),
    },
  };
}

export function responsesRequestToAnthropic(body: ResponsesRequest): AnthropicMessageRequest {
  const tools = (body.tools || [])
    .filter((tool) => !tool.type || tool.type === "function")
    .filter((tool) => tool.name)
    .map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters || { type: "object", properties: {} },
    }));
  return {
    model: body.model,
    max_tokens: body.max_output_tokens || 1024,
    system: typeof body.instructions === "string" ? body.instructions : undefined,
    messages: responsesInputToMessages(body.input),
    temperature: body.temperature,
    stream: false,
    tools,
  };
}

export function anthropicToResponses(message: AnthropicMessageResponse): ResponsesObject {
  const content: Array<Record<string, unknown>> = [];
  for (const block of message.content) {
    if (block.type === "text" && block.text) content.push({ type: "output_text", text: block.text });
    if (block.type === "tool_use") {
      content.push({ type: "function_call", call_id: block.id || "tool", name: block.name || "tool", arguments: JSON.stringify(block.input ?? {}) });
    }
  }
  const input = message.usage.input_tokens;
  const output = message.usage.output_tokens;
  return {
    id: message.id.startsWith("resp_") ? message.id : `resp_${message.id}`,
    object: "response",
    status: "completed",
    model: message.model,
    output: [
      {
        type: "message",
        role: "assistant",
        status: "completed",
        content,
      },
    ],
    usage: { input_tokens: input, output_tokens: output, total_tokens: input + output },
  };
}

export function anthropicMessageToSse(message: AnthropicMessageResponse) {
  const started = { ...message, content: [] as AnthropicContentBlock[] };
  const lines = [
    sse("message_start", { type: "message_start", message: started }),
  ];
  message.content.forEach((block, index) => {
    if (block.type === "text") {
      lines.push(sse("content_block_start", { type: "content_block_start", index, content_block: { type: "text", text: "" } }));
      lines.push(sse("content_block_delta", { type: "content_block_delta", index, delta: { type: "text_delta", text: block.text || "" } }));
      lines.push(sse("content_block_stop", { type: "content_block_stop", index }));
    }
  });
  lines.push(
    sse("message_delta", {
      type: "message_delta",
      delta: { stop_reason: message.stop_reason, stop_sequence: null },
      usage: { output_tokens: message.usage.output_tokens },
    }),
  );
  lines.push(sse("message_stop", { type: "message_stop" }));
  return lines.join("\n") + "\n";
}

export function responsesObjectToSse(response: ResponsesObject) {
  const text = response.output
    .flatMap((item) => (Array.isArray(item.content) ? item.content : []))
    .map((part) => (part && typeof part === "object" && "text" in part ? String((part as { text?: string }).text || "") : ""))
    .join("");
  return [
    `data: ${JSON.stringify({ type: "response.created", response: { ...response, output: [] } })}`,
    `data: ${JSON.stringify({ type: "response.output_text.delta", delta: text })}`,
    `data: ${JSON.stringify({ type: "response.completed", response })}`,
  ].join("\n\n") + "\n\n";
}

export function usageFromResponsesStream(payload: string) {
  for (const line of payload.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    try {
      const json = JSON.parse(data) as { type?: string; response?: { usage?: { input_tokens?: number; output_tokens?: number } } };
      if (json.type === "response.completed" && json.response?.usage) {
        return {
          promptTokens: json.response.usage.input_tokens || 0,
          completionTokens: json.response.usage.output_tokens || 0,
        };
      }
    } catch {
      // ignore malformed SSE lines
    }
  }
  return null;
}

function anthropicMessageToChat(message: { role: string; content?: unknown }): ChatMessage[] {
  if (typeof message.content === "string" || message.content == null) {
    return [{ role: message.role, content: message.content }];
  }
  if (!Array.isArray(message.content)) return [{ role: message.role, content: message.content }];
  const blocks = message.content as AnthropicContentBlock[];
  const text = blocks.filter((block) => block.type === "text").map((block) => block.text || "").join("");
  const toolUses = blocks.filter((block) => block.type === "tool_use");
  const toolResults = blocks.filter((block) => block.type === "tool_result");
  const messages: ChatMessage[] = [];
  if (text || toolUses.length) {
    messages.push({
      role: message.role,
      content: text || null,
      tool_calls: toolUses.length
        ? toolUses.map((block) => ({
            id: block.id || "tool",
            type: "function",
            function: { name: block.name || "tool", arguments: JSON.stringify(block.input ?? {}) },
          }))
        : undefined,
    });
  }
  for (const block of toolResults) {
    messages.push({
      role: "tool",
      tool_call_id: block.tool_use_id || "tool",
      content: typeof block.content === "string" ? block.content : JSON.stringify(block.content ?? ""),
    });
  }
  return messages.length ? messages : [{ role: message.role, content: "" }];
}

function responsesInputToMessages(input: unknown) {
  if (typeof input === "string") return [{ role: "user", content: input }];
  if (!Array.isArray(input)) return [{ role: "user", content: "" }];
  const messages: Array<{ role: string; content: unknown }> = [];
  for (const item of input) {
    const record = asRecord(item);
    if (record.type === "function_call") {
      messages.push({
        role: "assistant",
        content: [{ type: "tool_use", id: record.call_id || "tool", name: record.name || "tool", input: parseJson(String(record.arguments || "{}")) }],
      });
      continue;
    }
    if (record.type === "function_call_output") {
      messages.push({
        role: "user",
        content: [{ type: "tool_result", tool_use_id: record.call_id || "tool", content: String(record.output || "") }],
      });
      continue;
    }
    const role = typeof record.role === "string" ? record.role : "user";
    if (role === "system") continue;
    messages.push({ role, content: textFromUnknown(record.content) });
  }
  return messages.length ? messages : [{ role: "user", content: "" }];
}

function textFromUnknown(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((part) => {
        if (typeof part === "string") return part;
        const record = asRecord(part);
        if (typeof record.text === "string") return record.text;
        return "";
      })
      .join("");
  }
  const record = asRecord(value);
  return typeof record.text === "string" ? record.text : "";
}

function sse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function numberFrom(value: unknown) {
  return typeof value === "number" ? value : 0;
}

function parseJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}
