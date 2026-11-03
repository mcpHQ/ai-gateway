import { redirect } from "next/navigation";
import { asc, count, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { providers } from "@/lib/db/schema";
import { requireOrg } from "@/lib/org";
import { ProviderForm } from "@/components/provider-form";
import { pageHref, pageWindow } from "@/lib/pagination";
import { Pagination } from "@/components/pagination";

const PAGE_SIZE = 10;
const PATHNAME = "/dashboard/providers";

export default async function ProvidersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const { org } = await requireOrg();
  const params = await searchParams;
  const where = eq(providers.organizationId, org.id);
  const [counted] = await db.select({ value: count() }).from(providers).where(where);
  const paging = pageWindow(params.page, PAGE_SIZE, Number(counted?.value ?? 0));
  if (paging.needsRedirect) redirect(pageHref(PATHNAME, paging.page));
  const rows = await db.query.providers.findMany({
    where,
    orderBy: [asc(providers.priority), asc(providers.createdAt), asc(providers.id)],
    limit: paging.pageSize,
    offset: paging.offset,
  });

  return (
    <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[1fr_320px]">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Providers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upstream credentials are encrypted at rest. Clients never see these keys.
        </p>
        <ul className="mt-6 space-y-3">
          {rows.length === 0 ? (
            <li className="rounded-2xl border border-dashed border-border bg-card/70 p-6 text-sm text-muted-foreground">
              Add OpenAI, Anthropic, Gemini, or an OpenAI-compatible base URL to start proxying.
            </li>
          ) : (
            rows.map((row) => (
              <li key={row.id} className="panel p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-medium">{row.name}</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {row.type} · priority {row.priority}
                      {row.baseUrl ? ` · ${row.baseUrl}` : ""}
                    </div>
                  </div>
                  <ProviderForm mode="delete" id={row.id} />
                </div>
                <ProviderForm mode="rotate" id={row.id} />
              </li>
            ))
          )}
        </ul>
        <Pagination paging={paging} pathname={PATHNAME} />
      </div>
      <ProviderForm mode="create" />
    </div>
  );
}
