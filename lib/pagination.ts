export type PageWindow = {
  page: number;
  pages: number;
  pageSize: number;
  total: number;
  offset: number;
  needsRedirect: boolean;
};

export function pageWindow(raw: string | string[] | undefined, pageSize: number, total: number): PageWindow {
  const size = Math.max(1, pageSize);
  const safeTotal = Math.max(0, Math.trunc(total) || 0);
  const pages = Math.max(1, Math.ceil(safeTotal / size));
  const text = Array.isArray(raw) ? raw[0] : raw;
  const parsed = text == null || text === "" ? Number.NaN : Number.parseInt(text, 10);
  const requested = Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
  const page = Math.min(requested, pages);
  const canonical = page <= 1 ? "" : String(page);
  const present = text != null && text !== "";

  return {
    page,
    pages,
    pageSize: size,
    total: safeTotal,
    offset: (page - 1) * size,
    needsRedirect: present && text !== canonical,
  };
}

export function pageLinks(page: number, pages: number): Array<number | "gap"> {
  if (pages <= 1) return [1];
  const wanted = new Set([1, pages, page - 1, page, page + 1]);
  const sorted = [...wanted].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const links: Array<number | "gap"> = [];
  for (const n of sorted) {
    const prev = links[links.length - 1];
    if (typeof prev === "number" && n - prev > 1) links.push("gap");
    links.push(n);
  }
  return links;
}

export function pageHref(pathname: string, page: number) {
  return page <= 1 ? pathname : `${pathname}?page=${page}`;
}
