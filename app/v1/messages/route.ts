import { authenticateGatewayKey, gatewayAuthorization, proxyMessages, ProxyError } from "@/lib/llm/proxy";
import type { AnthropicMessageRequest } from "@/lib/llm/translate";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const key = await authenticateGatewayKey(gatewayAuthorization(request.headers.get("authorization"), request.headers.get("x-api-key")));
    const body = (await request.json()) as AnthropicMessageRequest;
    if (!body?.model || !Array.isArray(body.messages)) {
      return anthropicError(400, "model and messages are required");
    }
    return await proxyMessages({
      key,
      request: body,
      fallbackHeader: request.headers.get("x-ai-gateway-fallbacks"),
      cacheTtlHeader: request.headers.get("x-ai-gateway-cache-ttl"),
      promptCacheHeader: request.headers.get("x-ai-gateway-prompt-cache"),
      cacheModeHeader: request.headers.get("x-ai-gateway-cache-mode"),
      similarityHeader: request.headers.get("x-ai-gateway-similarity"),
      anthropicVersion: request.headers.get("anthropic-version"),
    });
  } catch (error) {
    if (error instanceof ProxyError) {
      const body = isAnthropicError(error.body) ? error.body : anthropicBody(error.status, error.message);
      return Response.json(body, { status: error.status, headers: error.headers });
    }
    const message = error instanceof Error ? error.message : "Internal error";
    const safe = message.includes("Failed query") ? "Database unavailable" : message;
    return anthropicError(500, safe);
  }
}

function anthropicError(status: number, message: string) {
  return Response.json(anthropicBody(status, message), { status });
}

function anthropicBody(status: number, message: string) {
  const type = status === 401 ? "authentication_error" : status === 429 ? "rate_limit_error" : status === 402 ? "billing_error" : "invalid_request_error";
  return { type: "error", error: { type, message } };
}

function isAnthropicError(body: unknown) {
  return Boolean(body && typeof body === "object" && "error" in body && "type" in body);
}
