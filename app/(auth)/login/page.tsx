"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { authClient } from "@/lib/auth-client";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const result = await authClient.signIn.email({
      email: String(form.get("email") || ""),
      password: String(form.get("password") || ""),
    });
    setPending(false);
    if (result.error) {
      setError(result.error.message || "Could not sign in.");
      return;
    }
    router.push("/dashboard");
  }

  return (
    <div className="panel p-8">
      <Link href="/" className="text-sm text-muted-foreground">
        Back
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-1 text-sm text-muted-foreground">Use the email for this gateway.</p>
      <form className="mt-6 space-y-4" onSubmit={onSubmit}>
        <label className="block text-sm font-medium">
          Email
          <input name="email" type="email" required className="field" />
        </label>
        <label className="block text-sm font-medium">
          Password
          <input name="password" type="password" required className="field" />
        </label>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button disabled={pending} className="btn-primary w-full">
          {pending ? "Signing in..." : "Sign in"}
        </button>
      </form>
      <p className="mt-4 text-sm text-muted-foreground">
        No account?{" "}
        <Link href="/signup" className="text-brand-foreground">
          Create one
        </Link>
      </p>
    </div>
  );
}
