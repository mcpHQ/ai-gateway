import { eq } from "drizzle-orm";
import { authenticateGatewayKey, ProxyError } from "@/lib/llm/proxy";
import { db } from "@/lib/db";
import { providers } from "@/lib/db/schema";
import { MODEL_PRICES, inferProvider, stripProviderPrefix } from "@/lib/cost/catalog";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const key = await authenticateGatewayKey(request.headers.get("authorization"));
    const orgProviders = await db.query.providers.findMany({
      where: eq(providers.organizationId, key.organizationId),
    });
    const types = new Set(orgProviders.map((item) => item.type));
    const extra = orgProviders.flatMap((item) => {
      try {
        return (JSON.parse(item.modelsJson) as unknown[]).map(String);
      } catch {
        return [];
      }
    });
    const models = [
      ...MODEL_PRICES.filter((model) => types.has(model.provider)).map((model) => model.id),
      ...extra,
    ];
    const unique = [...new Set(models)];
    return Response.json({
      object: "list",
      data: unique.map((id) => ({
        id,
        object: "model",
        created: 0,
        owned_by: inferProvider(id),
        root: stripProviderPrefix(id),
      })),
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
