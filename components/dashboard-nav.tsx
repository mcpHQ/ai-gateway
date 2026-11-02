"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/requests", label: "Requests" },
  { href: "/dashboard/providers", label: "Providers" },
  { href: "/dashboard/keys", label: "API keys" },
  { href: "/dashboard/calculator", label: "Calculator" },
  { href: "/dashboard/settings", label: "Settings" },
];

export function DashboardNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-border/80 bg-white/70 px-3 py-2 backdrop-blur lg:sticky lg:top-16 lg:h-[calc(100vh-4rem)] lg:flex-col lg:gap-1 lg:overflow-y-auto lg:border-r lg:border-b-0 lg:px-3 lg:py-5">
      {links.map((link) => {
        const active = link.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm transition ${
              active
                ? "bg-brand/10 font-medium text-brand-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
