import { redirect } from "next/navigation";
import { count, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { requireGateway } from "@/lib/gateway";
import { publicOrigin } from "@/lib/public-origin";
import { GatewayUsage } from "@/components/gateway-usage";
import { formatUsd } from "@/lib/cost/catalog";
import { ApiKeyForm } from "@/components/api-key-form";
import { pageHref, pageWindow } from "@/lib/pagination";
import { Pagination } from "@/components/pagination";

const PAGE_SIZE = 10;
const PATHNAME = "/dashboard/keys";

export default async function KeysPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const { gateway } = await requireGateway();
  const params = await searchParams;
  const origin = await publicOrigin();
  const where = eq(apiKeys.gatewayId, gateway.id);
  const [counted] = await db.select({ value: count() }).from(apiKeys).where(where);
  const paging = pageWindow(params.page, PAGE_SIZE, Number(counted?.value ?? 0));
  if (paging.needsRedirect) redirect(pageHref(PATHNAME, paging.page));
  const rows = await db.query.apiKeys.findMany({
    where,
    orderBy: [desc(apiKeys.createdAt), desc(apiKeys.id)],
    limit: paging.pageSize,
    offset: paging.offset,
  });

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <GatewayUsage origin={origin} gatewayName={gateway.name} />
      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">API keys</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Clients send <code className="rounded bg-muted px-1">Authorization: Bearer sk_live_...</code> to{" "}
          <code className="rounded bg-muted px-1">/v1</code>.
        </p>
        <ul className="mt-6 space-y-3">
          {rows.length === 0 ? (
            <li className="rounded-2xl border border-dashed border-border bg-white/70 p-6 text-sm text-muted-foreground">
              Create a gateway key for your SDK or agent.
            </li>
          ) : (
            rows.map((row) => (
              <li key={row.id} className="panel p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-medium">{row.name}</div>
                    <div className="mt-1 font-mono text-sm text-muted-foreground">{row.keyPrefix}...</div>
                    <div className="mt-2 text-sm text-muted-foreground">
                      Spend {formatUsd(row.periodSpendMicros)}
                      {row.monthlyBudgetCents != null ? ` / $${(row.monthlyBudgetCents / 100).toFixed(2)} budget` : " · no budget"}
                      {row.requestsPerMinute != null ? ` · ${row.requestsPerMinute}/min` : " · no rate limit"}
                      {row.disabled ? " · disabled" : ""}
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <ApiKeyForm mode="disable" id={row.id} disabled={row.disabled} />
                    <ApiKeyForm mode="delete" id={row.id} />
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>
        <Pagination paging={paging} pathname={PATHNAME} />
      </div>
      <ApiKeyForm mode="create" />
      </div>
    </div>
  );
}
