type CacheBlock = Record<string, unknown> & { cache_control?: { type: "ephemeral" } };

export function resolvePromptCaching(header: string | null, gateway: unknown) {
  const raw = header?.trim() || stringField(gateway, "caching") || "off";
  return raw.toLowerCase() === "auto" ? "auto" : "off";
}

export function applyAnthropicPromptCache<T extends { system?: unknown; messages?: Array<{ role?: string; content?: unknown }> }>(body: T, enabled: boolean): T {
  if (!enabled) return body;
  const messages = [...(body.messages || [])];
  const lastUserIndex = messages.reduce((found, message, index) => (message.role === "user" ? index : found), -1);
  const prefixIndex = lastUserIndex > 0 ? lastUserIndex - 1 : -1;
  const marked = messages.map((message, index) => {
    if (index !== messages.length - 1 && index !== prefixIndex) return message;
    return { ...message, content: markContent(message.content) };
  });
  const system = prefixIndex < 0 && body.system != null ? markContent(body.system) : body.system;
  return { ...body, system, messages: marked };
}

function markContent(content: unknown) {
  if (typeof content === "string") {
    return [{ type: "text", text: content, cache_control: { type: "ephemeral" } }];
  }
  if (!Array.isArray(content) || content.length === 0) return content;
  const blocks = content.map((block) => (block && typeof block === "object" ? { ...(block as CacheBlock) } : block));
  const last = blocks[blocks.length - 1];
  if (last && typeof last === "object") {
    blocks[blocks.length - 1] = { ...last, cache_control: { type: "ephemeral" } };
  }
  return blocks;
}

function stringField(gateway: unknown, key: string) {
  if (!gateway || typeof gateway !== "object" || !(key in gateway)) return "";
  const value = (gateway as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}
