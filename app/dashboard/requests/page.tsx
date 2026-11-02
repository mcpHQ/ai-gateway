import { redirect } from "next/navigation";
import { and, count, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { llmRequests } from "@/lib/db/schema";
import { requireGateway } from "@/lib/gateway";
import { formatUsd } from "@/lib/cost/catalog";
import { pageHref, pageWindow } from "@/lib/pagination";
import { Pagination } from "@/components/pagination";

const PAGE_SIZE = 25;
const PATHNAME = "/dashboard/requests";

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const { org, gateway } = await requireGateway();
  const params = await searchParams;
  const where = and(eq(llmRequests.organizationId, org.id), eq(llmRequests.gatewayId, gateway.id));
  const [counted] = await db.select({ value: count() }).from(llmRequests).where(where);
  const paging = pageWindow(params.page, PAGE_SIZE, Number(counted?.value ?? 0));
  if (paging.needsRedirect) redirect(pageHref(PATHNAME, paging.page));

  const rows = await db.query.llmRequests.findMany({
    where,
    orderBy: [desc(llmRequests.createdAt), desc(llmRequests.id)],
    limit: paging.pageSize,
    offset: paging.offset,
  });

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-semibold tracking-tight">Request log</h1>
      <p className="mt-1 text-sm text-muted-foreground">Proxied calls for this gateway, newest first, including failures.</p>
      <div className="panel mt-6">
        <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/80 text-xs tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-3 font-medium">Time</th>
              <th className="px-4 py-3 font-medium">Model</th>
              <th className="px-4 py-3 font-medium">Provider</th>
              <th className="px-4 py-3 font-medium">Attempts</th>
              <th className="px-4 py-3 font-medium">Guard</th>
              <th className="px-4 py-3 font-medium">Cache</th>
              <th className="px-4 py-3 font-medium">Tokens</th>
              <th className="px-4 py-3 font-medium">Cost</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Latency</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-muted-foreground" colSpan={10}>
                  No requests yet.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b border-border/70 last:border-0 hover:bg-muted/40">
                  <td className="whitespace-nowrap px-4 py-3">{row.createdAt.toISOString().replace("T", " ").slice(0, 19)}</td>
                  <td className="px-4 py-3">
                    {row.model}
                    {row.usageSource === "estimated" ? (
                      <span className="ml-2 text-xs text-muted-foreground">est.</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">{row.providerType}</td>
                  <td className="px-4 py-3">{attemptCount(row.attemptsJson)}</td>
                  <td className="px-4 py-3">{guardLabel(row.guardAction, row.guardFindings)}</td>
                  <td className="px-4 py-3">{cacheLabel(row.cacheKind, row.cacheHit)}</td>
                  <td className="px-4 py-3">
                    {row.promptTokens} / {row.completionTokens}
                  </td>
                  <td className="px-4 py-3">{formatUsd(row.costMicros)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        row.status >= 500
                          ? "bg-red-50 text-red-700"
                          : row.status >= 400
                            ? "bg-amber-50 text-amber-800"
                            : "bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">{row.durationMs}ms</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
        <div className="px-4 pb-4">
          <Pagination paging={paging} pathname={PATHNAME} />
        </div>
      </div>
    </div>
  );
}

function guardLabel(action: string, findings: string) {
  if (!action || findings === "[]") return "Clear";
  const count = attemptCount(findings);
  return action === "block" ? `Blocked ${count}` : `Flagged ${count}`;
}

function cacheLabel(kind: string, hit: boolean) {
  if (kind === "semantic") return "Semantic";
  if (kind === "exact" || hit) return "Hit";
  return "Miss";
}

function attemptCount(raw: string) {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}
