import Link from "next/link";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { accountExists } from "@/lib/account";

const links = [
  { href: "#routing", label: "Routing" },
  { href: "#spend", label: "Spend" },
  { href: "#deploy", label: "Self-host" },
];

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const hasAccount = await accountExists();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <Logo className="h-7 w-7" />
            AI Gateway
          </Link>
          <nav className="hidden items-center gap-1 sm:flex">
            {links.map((link) => (
              <a key={link.href} href={link.href} className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
                {link.label}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 text-sm">
            <a href="https://github.com/mcpHQ/ai-gateway" className="hidden rounded-lg px-3 py-2 text-muted-foreground hover:text-foreground sm:inline">
              GitHub
            </a>
            <ThemeToggle />
            {hasAccount ? null : (
              <Link href="/login" className="rounded-lg px-3 py-2 text-muted-foreground hover:text-foreground">
                Sign in
              </Link>
            )}
            <Link href={hasAccount ? "/login" : "/signup"} className="btn-primary">
              {hasAccount ? "Sign in" : "Get started"}
            </Link>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
