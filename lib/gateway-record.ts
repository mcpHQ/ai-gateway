import { db } from "@/lib/db";
import { gateways } from "@/lib/db/schema";

export async function createGatewayRecord(organizationId: string, name: string) {
  const id = crypto.randomUUID();
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "gateway";
  const [row] = await db
    .insert(gateways)
    .values({
      id,
      organizationId,
      name,
      slug: `${base}-${id.slice(0, 4)}`,
    })
    .returning();
  return row;
}
