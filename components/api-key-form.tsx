"use client";

import { useState } from "react";
import { createApiKey, deleteApiKey, setApiKeyDisabled } from "@/lib/actions";

export function ApiKeyForm({ mode, id, disabled = false }: { mode: "create" | "delete" | "disable"; id?: string; disabled?: boolean }) {
  const [error, setError] = useState("");
  const [secret, setSecret] = useState("");
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState(false);

  if (mode === "disable" && id) {
    return (
      <button
        className="text-sm text-brand-foreground"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          await setApiKeyDisabled(id, !disabled);
          setPending(false);
        }}
      >
        {disabled ? "Enable" : "Disable"}
      </button>
    );
  }

  if (mode === "delete" && id) {
    return (
      <button
        className="text-sm text-red-600"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          await deleteApiKey(id);
          setPending(false);
        }}
      >
        Revoke
      </button>
    );
  }

  return (
    <form
      className="h-fit space-y-3 panel p-5"
      action={async (formData) => {
        setPending(true);
        setSecret("");
        setCopied(false);
        const result = await createApiKey(formData);
        setPending(false);
        if (result?.error) {
          setError(result.error);
          return;
        }
        setError("");
        if (result?.key) {
          setSecret(result.key);
        }
      }}
    >
      <h2 className="font-semibold">Create key</h2>
      <label className="block text-sm">
        Name
        <input name="name" required className="field" placeholder="Production agent" />
      </label>
      <label className="block text-sm">
        Monthly budget (USD)
        <input name="budgetUsd" type="number" min="0" step="0.01" className="field" placeholder="optional" />
      </label>
      <label className="block text-sm">
        Requests per minute
        <input name="requestsPerMinute" type="number" min="1" step="1" className="field" placeholder="optional" />
      </label>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {secret ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950">
          <p className="text-sm text-amber-950 dark:text-amber-100">Copy this key now. It will not be shown again.</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-background px-2.5 py-2 font-mono text-xs whitespace-nowrap text-foreground">
              {secret}
            </code>
            <button
              type="button"
              className="btn-secondary shrink-0"
              onClick={async () => {
                await navigator.clipboard.writeText(secret);
                setCopied(true);
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      ) : null}
      <button disabled={pending} className="btn-primary w-full">
        {pending ? "Creating..." : "Create key"}
      </button>
    </form>
  );
}
