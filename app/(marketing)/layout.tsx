import Link from "next/link";
import { Logo } from "@/components/logo";
import { accountExists } from "@/lib/account";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const hasAccount = await accountExists();
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <Logo />
          AI Gateway
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          {hasAccount ? null : (
            <Link href="/login" className="rounded-lg px-3 py-2 text-muted-foreground hover:text-foreground">
              Sign in
            </Link>
          )}
          <Link href={hasAccount ? "/login" : "/signup"} className="btn-primary">
            {hasAccount ? "Sign in" : "Get started"}
          </Link>
        </nav>
      </header>
      {children}
    </div>
  );
}
