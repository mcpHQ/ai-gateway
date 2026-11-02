import { authenticateGatewayKey, proxyEmbeddings, ProxyError } from "@/lib/llm/proxy";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const key = await authenticateGatewayKey(request.headers.get("authorization"));
    const body = (await request.json()) as { model?: string; input?: unknown };
    if (!body?.model || body.input == null) {
      return Response.json(
        { error: { message: "model and input are required", type: "invalid_request_error" } },
        { status: 400 },
      );
    }
    return await proxyEmbeddings({
      key,
      body: { ...body, model: body.model, input: body.input },
      fallbackHeader: request.headers.get("x-ai-gateway-fallbacks"),
      cacheTtlHeader: request.headers.get("x-ai-gateway-cache-ttl"),
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
