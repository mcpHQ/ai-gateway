import Link from "next/link";
import { Logo } from "@/components/logo";
import { requireGateway } from "@/lib/gateway";
import { SignOutButton } from "@/components/sign-out";
import { GatewaySwitcher } from "@/components/gateway-switcher";
import { DashboardNav } from "@/components/dashboard-nav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { org, user, gateways, gateway } = await requireGateway();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-white/80 backdrop-blur-xl">
        <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
          <Link href="/dashboard" className="flex shrink-0 items-center gap-2 font-semibold">
            <Logo className="h-7 w-7" />
            <span className="hidden sm:inline">AI Gateway</span>
          </Link>
          <GatewaySwitcher
            placement="navbar"
            gateways={gateways.map((item) => ({ id: item.id, name: item.name }))}
            currentId={gateway.id}
          />
          <div className="ml-auto flex min-w-0 items-center gap-3">
            <div className="hidden min-w-0 text-right sm:block">
              <div className="truncate text-sm font-medium">{org.name}</div>
              <div className="truncate text-xs text-muted-foreground">{user.email}</div>
            </div>
            <SignOutButton className="btn-secondary" />
          </div>
        </div>
      </header>
      <div className="lg:grid lg:grid-cols-[232px_1fr]">
        <DashboardNav />
        <main className="min-w-0 px-4 py-8 sm:px-8">{children}</main>
      </div>
    </div>
  );
}
