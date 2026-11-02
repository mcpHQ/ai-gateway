import { redirect } from "next/navigation";
import { and, asc, desc, eq, gte, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { llmRequests, modelPrices } from "@/lib/db/schema";
import { requireGateway } from "@/lib/gateway";
import { publicOrigin } from "@/lib/public-origin";
import { GatewayUsage } from "@/components/gateway-usage";
import { formatUsd, type PriceOverride } from "@/lib/cost/catalog";
import { promptCacheSavedMicros, responseCacheSavedMicros } from "@/lib/cost/savings";
import { pageHref, pageWindow } from "@/lib/pagination";
import { Pagination } from "@/components/pagination";

const MODEL_PAGE_SIZE = 8;
const PATHNAME = "/dashboard";

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const { org, gateway } = await requireGateway();
  const params = await searchParams;
  const origin = await publicOrigin();
  const now = new Date();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const startOfDayIso = startOfDay.toISOString();
  const startOfMonthIso = startOfMonth.toISOString();

  const [totals] = await db
    .select({
      today: sql<number>`coalesce(sum(case when ${llmRequests.createdAt} >= ${startOfDayIso}::timestamptz then ${llmRequests.costMicros} else 0 end), 0)`,
      month: sql<number>`coalesce(sum(case when ${llmRequests.createdAt} >= ${startOfMonthIso}::timestamptz then ${llmRequests.costMicros} else 0 end), 0)`,
      requests: sql<number>`count(*)::int`,
      tokens: sql<number>`coalesce(sum(${llmRequests.promptTokens} + ${llmRequests.completionTokens}), 0)`,
    })
    .from(llmRequests)
    .where(and(eq(llmRequests.organizationId, org.id), eq(llmRequests.gatewayId, gateway.id)));

  const modelWhere = and(eq(llmRequests.organizationId, org.id), eq(llmRequests.gatewayId, gateway.id), gte(llmRequests.createdAt, startOfMonth));
  const [modelCount] = await db
    .select({ value: sql<number>`count(distinct ${llmRequests.model})::int` })
    .from(llmRequests)
    .where(modelWhere);
  const models = pageWindow(params.page, MODEL_PAGE_SIZE, Number(modelCount?.value ?? 0));
  if (models.needsRedirect) redirect(pageHref(PATHNAME, models.page));

  const byModel = await db
    .select({
      model: llmRequests.model,
      costMicros: sql<number>`coalesce(sum(${llmRequests.costMicros}), 0)`,
      requests: sql<number>`count(*)::int`,
    })
    .from(llmRequests)
    .where(modelWhere)
    .groupBy(llmRequests.model)
    .orderBy(sql`sum(${llmRequests.costMicros}) desc`, asc(llmRequests.model))
    .limit(models.pageSize)
    .offset(models.offset);

  const recent = await db.query.llmRequests.findMany({
    where: and(eq(llmRequests.organizationId, org.id), eq(llmRequests.gatewayId, gateway.id)),
    orderBy: desc(llmRequests.createdAt),
    limit: 8,
  });

  const priceRows = await db.query.modelPrices.findMany({
    where: eq(modelPrices.organizationId, org.id),
  });
  const overrides: PriceOverride[] = priceRows.map((row) => ({
    model: row.model,
    inputPerMillion: Number(row.inputPerMillion),
    outputPerMillion: Number(row.outputPerMillion),
  }));
  const cacheRows = await db
    .select({
      model: llmRequests.model,
      kind: llmRequests.cacheKind,
      hit: llmRequests.cacheHit,
      requests: sql<number>`count(*)::int`,
      promptTokens: sql<number>`coalesce(sum(${llmRequests.promptTokens}), 0)`,
      completionTokens: sql<number>`coalesce(sum(${llmRequests.completionTokens}), 0)`,
      cacheReadTokens: sql<number>`coalesce(sum(${llmRequests.cacheReadTokens}), 0)`,
    })
    .from(llmRequests)
    .where(
      and(
        eq(llmRequests.organizationId, org.id),
        eq(llmRequests.gatewayId, gateway.id),
        gte(llmRequests.createdAt, startOfMonth),
        or(eq(llmRequests.cacheHit, true), sql`${llmRequests.cacheReadTokens} > 0`),
      ),
    )
    .groupBy(llmRequests.model, llmRequests.cacheKind, llmRequests.cacheHit);

  const exactRows = cacheRows.filter((row) => row.hit && row.kind !== "semantic");
  const semanticRows = cacheRows.filter((row) => row.kind === "semantic");
  const exactSaved = responseCacheSavedMicros(exactRows.map(asTokens), overrides);
  const semanticSaved = responseCacheSavedMicros(semanticRows.map(asTokens), overrides);
  const promptSaved = promptCacheSavedMicros(
    cacheRows.map((row) => ({ model: row.model, cacheReadTokens: Number(row.cacheReadTokens) })),
    overrides,
  );
  const exactCount = exactRows.reduce((sum, row) => sum + Number(row.requests), 0);
  const semanticCount = semanticRows.reduce((sum, row) => sum + Number(row.requests), 0);
  const promptTokens = cacheRows.reduce((sum, row) => sum + Number(row.cacheReadTokens), 0);
  const totalSaved = exactSaved + semanticSaved + promptSaved;
  const [guardTotals] = await db
    .select({
      flagged: sql<number>`count(*) filter (where ${llmRequests.guardAction} = 'flag')::int`,
      blocked: sql<number>`count(*) filter (where ${llmRequests.guardAction} = 'block')::int`,
    })
    .from(llmRequests)
    .where(and(eq(llmRequests.organizationId, org.id), eq(llmRequests.gatewayId, gateway.id), gte(llmRequests.createdAt, startOfMonth)));

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Spend overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">{gateway.name}. Totals are calculated from this gateway&apos;s traffic.</p>
      </div>
      <GatewayUsage origin={origin} gatewayName={gateway.name} />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Today" value={formatUsd(Number(totals?.today || 0))} />
        <Stat label="This month" value={formatUsd(Number(totals?.month || 0))} />
        <Stat label="Requests" value={String(totals?.requests || 0)} />
        <Stat label="Tokens" value={Number(totals?.tokens || 0).toLocaleString()} />
      </section>
      <section className="panel p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-semibold">Cache savings</h2>
            <p className="mt-1 text-sm text-muted-foreground">This month. Response-cache hits are the full price that was not sent to a provider.</p>
          </div>
          <div className="text-2xl font-semibold tracking-tight tracking-tight">{formatUsd(totalSaved)}</div>
        </div>
        <ul className="mt-5 grid gap-3 sm:grid-cols-3">
          <CacheStat label="Exact hits" detail={`${exactCount.toLocaleString()} requests`} value={formatUsd(exactSaved)} />
          <CacheStat label="Semantic hits" detail={`${semanticCount.toLocaleString()} requests`} value={formatUsd(semanticSaved)} />
          <CacheStat label="Prompt-cache reads" detail={`${promptTokens.toLocaleString()} tokens`} value={formatUsd(promptSaved)} />
        </ul>
        <p className="mt-4 text-xs text-muted-foreground">
          Prompt-cache savings are the difference between full input price and the billed cache-read price: 90% off for Anthropic and 50% off for OpenAI. Semantic lookup embeddings are included in request cost.
        </p>
      </section>
      <section className="panel p-5">
        <h2 className="font-semibold">Threat detection</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This month. Prompts are checked for instruction override, leaked secrets, and payment card numbers before they reach a provider.
        </p>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          <CacheStat label="Flagged" detail="Allowed, recorded on the request" value={Number(guardTotals?.flagged || 0).toLocaleString()} />
          <CacheStat label="Blocked" detail="Stopped with HTTP 403" value={Number(guardTotals?.blocked || 0).toLocaleString()} />
        </ul>
      </section>
      <OperatorMetrics orgId={org.id} gatewayId={gateway.id} />
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="panel p-5">
          <h2 className="font-semibold">Spend by model</h2>
          <ul className="mt-4 space-y-3 text-sm">
            {byModel.length === 0 ? (
              <li className="text-muted-foreground">No traffic this month yet.</li>
            ) : (
              byModel.map((row) => (
                <li key={row.model} className="flex items-center justify-between gap-4">
                  <span className="truncate font-medium">{row.model}</span>
                  <span className="text-muted-foreground">
                    {formatUsd(Number(row.costMicros))} · {row.requests}
                  </span>
                </li>
              ))
            )}
          </ul>
          <Pagination paging={models} pathname={PATHNAME} />
        </div>
        <div className="panel p-5">
          <h2 className="font-semibold">Recent requests</h2>
          <ul className="mt-4 space-y-3 text-sm">
            {recent.length === 0 ? (
              <li className="text-muted-foreground">Send a request to /v1/chat/completions to populate this list.</li>
            ) : (
              recent.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-4">
                  <span className="truncate">
                    {row.model}{" "}
                    <span className="text-muted-foreground">{row.status}</span>
                  </span>
                  <span>{formatUsd(row.costMicros)}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      </section>
    </div>
  );
}

async function OperatorMetrics({ orgId, gatewayId }: { orgId: string; gatewayId: string }) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [ops] = await db
    .select({
      requests: sql<number>`count(*)::int`,
      errors: sql<number>`count(*) filter (where ${llmRequests.status} >= 400)::int`,
      upstreamErrors: sql<number>`count(*) filter (where ${llmRequests.status} >= 500)::int`,
      throttled: sql<number>`count(*) filter (where ${llmRequests.status} = 429)::int`,
      blocked: sql<number>`count(*) filter (where ${llmRequests.guardAction} = 'block')::int`,
    })
    .from(llmRequests)
    .where(and(eq(llmRequests.organizationId, orgId), eq(llmRequests.gatewayId, gatewayId), gte(llmRequests.createdAt, since)));
  const sizeRows = await db.execute<{ bytes: string | number }>(sql`select pg_database_size(current_database()) as bytes`);
  const bytes = Number(sizeRows[0]?.bytes || 0);
  const requests = Number(ops?.requests || 0);
  const errors = Number(ops?.errors || 0);
  const errorRate = requests === 0 ? "0%" : `${((errors / requests) * 100).toFixed(1)}%`;

  return (
    <section className="panel p-5">
      <h2 className="font-semibold">Operations</h2>
      <p className="mt-1 text-sm text-muted-foreground">Last 24 hours for this workspace. Database size is the whole installation.</p>
      <ul className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <CacheStat label="Error rate" detail={`${errors.toLocaleString()} of ${requests.toLocaleString()}`} value={errorRate} />
        <CacheStat label="Upstream 5xx" detail="Provider or gateway failures" value={Number(ops?.upstreamErrors || 0).toLocaleString()} />
        <CacheStat label="Upstream 429s" detail="Provider rate limits" value={Number(ops?.throttled || 0).toLocaleString()} />
        <CacheStat label="Guard blocks" detail="Stopped before the provider" value={Number(ops?.blocked || 0).toLocaleString()} />
        <CacheStat label="Database" detail="Postgres size" value={formatBytes(bytes)} />
      </ul>
    </section>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function asTokens(row: { model: string; promptTokens: number; completionTokens: number }) {
  return {
    model: row.model,
    promptTokens: Number(row.promptTokens),
    completionTokens: Number(row.completionTokens),
  };
}

function CacheStat({ label, detail, value }: { label: string; detail: string; value: string }) {
  return (
    <li className="rounded-xl bg-muted/80 px-4 py-3">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{detail}</div>
    </li>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel p-5">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight tracking-tight">{value}</div>
    </div>
  );
}
