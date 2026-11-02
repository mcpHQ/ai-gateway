import { redirect } from "next/navigation";
import { asc, count, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { modelPrices } from "@/lib/db/schema";
import { requireGateway } from "@/lib/gateway";
import { MODEL_PRICES } from "@/lib/cost/catalog";
import { PriceOverrideForm } from "@/components/price-override-form";
import { GatewaySettingsForm } from "@/components/gateway-settings-form";
import { pageHref, pageWindow } from "@/lib/pagination";
import { Pagination } from "@/components/pagination";

const PAGE_SIZE = 8;
const PATHNAME = "/dashboard/settings";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const { org, user, gateway } = await requireGateway();
  const params = await searchParams;
  const where = eq(modelPrices.organizationId, org.id);
  const [counted] = await db.select({ value: count() }).from(modelPrices).where(where);
  const paging = pageWindow(params.page, PAGE_SIZE, Number(counted?.value ?? 0));
  if (paging.needsRedirect) redirect(pageHref(PATHNAME, paging.page));
  const overrides = await db.query.modelPrices.findMany({
    where,
    orderBy: [asc(modelPrices.model), asc(modelPrices.id)],
    limit: paging.pageSize,
    offset: paging.offset,
  });

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {gateway.name} · {org.name} · {user.email}
        </p>
      </div>
      <section className="panel p-6">
        <h2 className="font-semibold">Routing and limits</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Organization budget applies to every key. Cache stays off until a TTL is set here or a request sends{" "}
          <code>x-ai-gateway-cache-ttl</code>. Fallback models run after the requested model fails with a retryable error.
        </p>
        <GatewaySettingsForm
          budgetUsd={gateway.monthlyBudgetCents == null ? "" : (gateway.monthlyBudgetCents / 100).toFixed(2)}
          cacheTtlSeconds={gateway.cacheTtlSeconds == null ? "" : String(gateway.cacheTtlSeconds)}
          cacheMode={gateway.cacheMode === "semantic" ? "semantic" : "exact"}
          similarity={gateway.similarityThreshold || "0.95"}
          guardAction={gateway.guardAction === "off" || gateway.guardAction === "block" ? gateway.guardAction : "flag"}
          fallbacks={parseList(gateway.fallbacksJson).join(", ")}
        />
      </section>
      <section className="panel p-6">
        <h2 className="font-semibold">Price overrides</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Override catalog rates (USD per million tokens) for this workspace.
        </p>
        <ul className="mt-4 space-y-2 text-sm">
          {overrides.length === 0 ? (
            <li className="text-muted-foreground">Using the built-in catalog only.</li>
          ) : (
            overrides.map((row) => (
              <li key={row.id} className="flex justify-between gap-4">
                <span>{row.model}</span>
                <span className="text-muted-foreground">
                  ${row.inputPerMillion} in / ${row.outputPerMillion} out
                </span>
              </li>
            ))
          )}
        </ul>
        <Pagination paging={paging} pathname={PATHNAME} />
        <PriceOverrideForm models={MODEL_PRICES.map((item) => item.id)} />
      </section>
      <section className="panel p-6 text-sm">
        <h2 className="font-semibold">Proxy</h2>
        <p className="mt-2 text-muted-foreground">
          Base URL: <code>/v1</code>
          <br />
          Chat: <code>/v1/chat/completions</code>
          <br />
          Responses: <code>/v1/responses</code>
          <br />
          Messages: <code>/v1/messages</code> with <code>x-api-key</code> or a bearer token
          <br />
          Embeddings: <code>/v1/embeddings</code>
          <br />
          Models: <code>/v1/models</code>
        </p>
        <p className="mt-3 text-muted-foreground">
          Request headers: <code>x-ai-gateway-fallbacks</code> (comma-separated models) and <code>x-ai-gateway-cache-ttl</code>{" "}
          (seconds, minimum 60). The same values can be sent as a <code>gateway</code> object in the JSON body. That object is
          removed before the provider call. <code>gateway.caching</code> set to <code>auto</code>, or{" "}
          <code>x-ai-gateway-prompt-cache: auto</code>, adds Anthropic prompt-cache markers and leaves OpenAI implicit caching
          unchanged. <code>x-ai-gateway-cache-mode: semantic</code> checks an embedding neighbor after an exact miss. Responses
          include <code>x-ai-gateway-provider</code>, <code>x-ai-gateway-model</code>, <code>x-ai-gateway-attempt</code>, and{" "}
          <code>x-ai-gateway-cache</code>.
        </p>
        <p className="mt-3 text-muted-foreground">
          Vercel Hobby functions time out at 60s; Pro allows up to 300s via maxDuration. Very long agent runs may need a
          later non-serverless data plane.
        </p>
      </section>
    </div>
  );
}

function parseList(raw: string) {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
