"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  return (
    <button
      className={className ?? "mt-3 text-sm text-brand-foreground"}
      onClick={async () => {
        await authClient.signOut();
        router.push("/");
      }}
    >
      Sign out
    </button>
  );
}
