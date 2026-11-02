"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createNamedGateway, selectGateway } from "@/lib/actions";
import { Logo } from "@/components/logo";

export function GatewaySwitcher({
  gateways,
  currentId,
  placement = "sidebar",
}: {
  gateways: Array<{ id: string; name: string }>;
  currentId: string;
  placement?: "sidebar" | "navbar";
}) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const current = gateways.find((gateway) => gateway.id === currentId) ?? gateways[0];
  const visible = gateways.filter((gateway) => gateway.name.toLowerCase().includes(query.trim().toLowerCase()));

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function choose(id: string) {
    if (id === currentId) {
      setOpen(false);
      return;
    }
    setPending(true);
    await selectGateway(id);
    setOpen(false);
    router.refresh();
    setPending(false);
  }

  return (
    <div ref={panelRef} className={placement === "navbar" ? "relative" : "relative px-3 pt-3"}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={pending}
        onClick={() => {
          setOpen((value) => !value);
          setCreating(false);
          setError("");
        }}
        className={
          placement === "navbar"
            ? "flex max-w-56 items-center gap-2 rounded-lg border border-border bg-white px-2.5 py-1.5 text-left hover:bg-muted"
            : "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-muted"
        }
      >
        {placement === "navbar" ? null : <Logo className="h-7 w-7 shrink-0" />}
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{current?.name ?? "Gateway"}</span>
        <Chevron />
      </button>
      {open ? (
        <div className={`panel absolute top-full z-30 mt-2 w-72 p-2 ${placement === "navbar" ? "left-0" : "left-3"}`}>
          <label className="relative block">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
              <SearchIcon />
            </span>
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find gateway..."
              className="w-full rounded-lg border border-border py-1.5 pr-2 pl-8 text-sm outline-none"
            />
          </label>
          <ul role="listbox" className="mt-2 max-h-64 overflow-y-auto">
            {visible.length === 0 ? (
              <li className="px-2 py-3 text-sm text-muted-foreground">No gateways</li>
            ) : (
              visible.map((gateway) => {
                const selected = gateway.id === currentId;
                return (
                  <li key={gateway.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      disabled={pending}
                      onClick={() => choose(gateway.id)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm ${selected ? "bg-muted" : "hover:bg-muted"}`}
                    >
                      <span className="min-w-0 flex-1 truncate">{gateway.name}</span>
                      {selected ? <CheckIcon /> : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
          <div className="mt-1 border-t border-border pt-1">
            {creating ? (
              <form
                className="space-y-2 p-1"
                action={async (formData) => {
                  setPending(true);
                  setError("");
                  const result = await createNamedGateway(formData);
                  setPending(false);
                  if (result?.error) {
                    setError(result.error);
                    return;
                  }
                  setCreating(false);
                  setOpen(false);
                  router.refresh();
                }}
              >
                <input name="name" required autoFocus placeholder="Gateway name" className="w-full rounded-lg border border-border px-2 py-1.5 text-sm" />
                {error ? <p className="text-xs text-red-600">{error}</p> : null}
                <div className="flex justify-end gap-2">
                  <button type="button" className="rounded-lg px-2 py-1 text-sm" onClick={() => setCreating(false)}>
                    Cancel
                  </button>
                  <button disabled={pending} className="btn-primary px-2.5 py-1">
                    {pending ? "Creating..." : "Create"}
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-muted"
                onClick={() => setCreating(true)}
              >
                <span className="text-brand-foreground">+</span>
                New gateway
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Chevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0 text-muted-foreground">
      <path d="M4 6.5 8 10.5 12 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="4.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10.5 10.5 13.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="text-foreground">
      <path d="M3.5 8.5 6.5 11.5 12.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
