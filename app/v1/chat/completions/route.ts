import { authenticateGatewayKey, proxyChatCompletions, ProxyError } from "@/lib/llm/proxy";
import type { ChatCompletionRequest } from "@/lib/llm/anthropic";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const key = await authenticateGatewayKey(request.headers.get("authorization"));
    const body = (await request.json()) as ChatCompletionRequest;
    if (!body?.model || !Array.isArray(body.messages)) {
      return Response.json(
        { error: { message: "model and messages are required", type: "invalid_request_error" } },
        { status: 400 },
      );
    }
    return await proxyChatCompletions({
      key,
      request: body,
      fallbackHeader: request.headers.get("x-ai-gateway-fallbacks"),
      cacheTtlHeader: request.headers.get("x-ai-gateway-cache-ttl"),
      promptCacheHeader: request.headers.get("x-ai-gateway-prompt-cache"),
      cacheModeHeader: request.headers.get("x-ai-gateway-cache-mode"),
      similarityHeader: request.headers.get("x-ai-gateway-similarity"),
    });
  } catch (error) {
    if (error instanceof ProxyError) {
      return Response.json(error.body, { status: error.status, headers: error.headers });
    }
    const message = error instanceof Error ? error.message : "Internal error";
    const safe = message.includes("Failed query") ? "Database unavailable" : message;
    return Response.json({ error: { message: safe, type: "api_error" } }, { status: 500 });
  }
}
