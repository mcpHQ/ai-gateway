import { cookies } from "next/headers";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { gateways } from "@/lib/db/schema";
import { createGatewayRecord } from "@/lib/gateway-record";
import { requireOrg } from "@/lib/org";

export { createGatewayRecord };

export async function requireGateway() {
  const ctx = await requireOrg();
  let rows = await db.query.gateways.findMany({
    where: eq(gateways.organizationId, ctx.org.id),
    orderBy: asc(gateways.createdAt),
  });
  if (rows.length === 0) {
    rows = [await createGatewayRecord(ctx.org.id, "Default")];
  }
  const selected = (await cookies()).get("ai-gateway-id")?.value;
  const gateway = rows.find((item) => item.id === selected) ?? rows[0];
  return { ...ctx, gateways: rows, gateway };
}
