import { describe, expect, it } from "vitest";
import { pageHref, pageLinks, pageWindow } from "./pagination";

describe("pageWindow", () => {
  it("starts at the first page when the query is missing or invalid", () => {
    expect(pageWindow(undefined, 25, 80)).toMatchObject({ page: 1, pages: 4, offset: 0, needsRedirect: false });
    expect(pageWindow("nope", 25, 80)).toMatchObject({ page: 1, offset: 0, needsRedirect: true });
    expect(pageWindow("0", 25, 80).page).toBe(1);
  });

  it("clamps a page past the end and asks for a canonical url", () => {
    expect(pageWindow("9", 10, 25)).toMatchObject({ page: 3, pages: 3, offset: 20, needsRedirect: true });
    expect(pageWindow("1", 10, 25).needsRedirect).toBe(true);
    expect(pageWindow("2", 10, 25)).toMatchObject({ page: 2, offset: 10, needsRedirect: false });
  });

  it("keeps a single page when there are no rows", () => {
    expect(pageWindow(undefined, 10, 0)).toMatchObject({ page: 1, pages: 1, offset: 0, total: 0 });
  });
});

describe("pageLinks", () => {
  it("keeps the ends and the neighbors of the current page", () => {
    expect(pageLinks(1, 1)).toEqual([1]);
    expect(pageLinks(5, 10)).toEqual([1, "gap", 4, 5, 6, "gap", 10]);
    expect(pageLinks(2, 10)).toEqual([1, 2, 3, "gap", 10]);
  });
});

describe("pageHref", () => {
  it("drops the query on the first page", () => {
    expect(pageHref("/dashboard/requests", 1)).toBe("/dashboard/requests");
    expect(pageHref("/dashboard/requests", 3)).toBe("/dashboard/requests?page=3");
  });
});
