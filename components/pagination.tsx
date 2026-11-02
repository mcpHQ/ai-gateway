import Link from "next/link";
import { pageHref, pageLinks, type PageWindow } from "@/lib/pagination";

export function Pagination({ paging, pathname }: { paging: PageWindow; pathname: string }) {
  if (paging.total <= paging.pageSize) return null;

  const start = paging.offset + 1;
  const end = Math.min(paging.offset + paging.pageSize, paging.total);
  const links = pageLinks(paging.page, paging.pages);

  return (
    <nav aria-label="Pagination" className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">
        {start.toLocaleString()}–{end.toLocaleString()} of {paging.total.toLocaleString()}
      </p>
      <div className="flex items-center gap-1">
        <PageControl href={paging.page > 1 ? pageHref(pathname, paging.page - 1) : undefined}>Previous</PageControl>
        {links.map((item, index) =>
          item === "gap" ? (
            <span key={`gap-${index}`} className="px-1 text-sm text-muted-foreground" aria-hidden>
              …
            </span>
          ) : (
            <Link
              key={item}
              href={pageHref(pathname, item)}
              aria-current={item === paging.page ? "page" : undefined}
              className={`inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-sm ${
                item === paging.page
                  ? "bg-brand/10 font-medium text-brand-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {item}
            </Link>
          ),
        )}
        <PageControl href={paging.page < paging.pages ? pageHref(pathname, paging.page + 1) : undefined}>Next</PageControl>
      </div>
    </nav>
  );
}

function PageControl({ href, children }: { href?: string; children: string }) {
  if (!href) {
    return (
      <span aria-disabled="true" className="inline-flex h-8 items-center rounded-lg px-2 text-sm text-muted-foreground opacity-40">
        {children}
      </span>
    );
  }
  return (
    <Link href={href} className="inline-flex h-8 items-center rounded-lg px-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
      {children}
    </Link>
  );
}
