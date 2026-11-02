"use client";

import { useState } from "react";
import { saveGatewaySettings } from "@/lib/actions";

export function GatewaySettingsForm({
  budgetUsd,
  cacheTtlSeconds,
  cacheMode,
  similarity,
  guardAction,
  fallbacks,
}: {
  budgetUsd: string;
  cacheTtlSeconds: string;
  cacheMode: string;
  similarity: string;
  guardAction: string;
  fallbacks: string;
}) {
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  return (
    <form
      className="mt-4 space-y-3"
      action={async (formData) => {
        setPending(true);
        setSaved(false);
        const result = await saveGatewaySettings(formData);
        setPending(false);
        if (result?.error) {
          setError(result.error);
          return;
        }
        setError("");
        setSaved(true);
      }}
    >
      <label className="block text-sm">
        Monthly gateway budget (USD)
        <input
          name="budgetUsd"
          type="number"
          min="0"
          step="0.01"
          defaultValue={budgetUsd}
          className="field"
          placeholder="optional"
        />
      </label>
      <label className="block text-sm">
        Response cache
        <select name="cacheMode" defaultValue={cacheMode} className="field">
          <option value="exact">Exact match</option>
          <option value="semantic">Exact match, then semantic</option>
        </select>
      </label>
      <label className="block text-sm">
        Semantic similarity
        <input name="similarity" type="number" min="0.8" max="0.99" step="0.01" defaultValue={similarity} className="field" />
      </label>
      <label className="block text-sm">
        Default cache TTL (seconds)
        <input
          name="cacheTtlSeconds"
          type="number"
          min="60"
          step="1"
          defaultValue={cacheTtlSeconds}
          className="field"
          placeholder="off unless set, minimum 60"
        />
      </label>
      <label className="block text-sm">
        Threat detection
        <select name="guardAction" defaultValue={guardAction} className="field">
          <option value="off">Off</option>
          <option value="flag">Flag and allow</option>
          <option value="block">Block</option>
        </select>
        <span className="mt-1 block text-xs text-muted-foreground">Checks prompts for instruction override, leaked secrets, and payment card numbers.</span>
      </label>
      <label className="block text-sm">
        Default fallback models
        <input
          name="fallbacks"
          defaultValue={fallbacks}
          className="field"
          placeholder="anthropic/claude-haiku-4-5, openai/gpt-4o-mini"
        />
      </label>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {saved ? <p className="text-sm text-muted-foreground">Saved.</p> : null}
      <button disabled={pending} className="btn-primary">
        {pending ? "Saving..." : "Save gateway settings"}
      </button>
    </form>
  );
}
