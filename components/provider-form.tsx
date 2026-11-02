"use client";

import { useState } from "react";
import { createProvider, deleteProvider, rotateProviderKey } from "@/lib/actions";

const providerLabels = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Gemini",
  openai_compatible: "Compatible",
} as const;

export function ProviderForm({ mode, id }: { mode: "create" | "delete" | "rotate"; id?: string }) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [type, setType] = useState<keyof typeof providerLabels>("openai");
  const [label, setLabel] = useState("OpenAI");
  const [labelEdited, setLabelEdited] = useState(false);

  if (mode === "rotate" && id) {
    return (
      <form
        className="mt-3 flex flex-wrap items-center gap-2"
        action={async (formData) => {
          setPending(true);
          setError("");
          const result = await rotateProviderKey(id, formData);
          setPending(false);
          if (result?.error) setError(result.error);
        }}
      >
        <input name="apiKey" type="password" autoComplete="new-password" required placeholder="New API key" className="field mt-0 min-w-40 flex-1" />
        <button disabled={pending} className="btn-secondary">
          {pending ? "Saving..." : "Rotate key"}
        </button>
        {error ? <p className="w-full text-sm text-red-600">{error}</p> : null}
      </form>
    );
  }

  if (mode === "delete" && id) {
    return (
      <button
        className="text-sm text-red-600"
        onClick={async () => {
          setPending(true);
          await deleteProvider(id);
          setPending(false);
        }}
        disabled={pending}
      >
        Remove
      </button>
    );
  }

  return (
    <form
      autoComplete="off"
      className="h-fit space-y-3 panel p-5"
      action={async (formData) => {
        setPending(true);
        const result = await createProvider(formData);
        setPending(false);
        if (result?.error) {
          setError(result.error);
        }
      }}
    >
      <h2 className="font-semibold">Add provider</h2>
      <label className="block text-sm">
        Name
        <input
          name="providerLabel"
          autoComplete="off"
          required
          className="field"
          value={label}
          onChange={(event) => {
            setLabel(event.target.value);
            setLabelEdited(true);
          }}
        />
      </label>
      <label className="block text-sm">
        Type
        <select
          name="type"
          className="field"
          value={type}
          onChange={(event) => {
            const next = event.target.value as keyof typeof providerLabels;
            setType(next);
            if (!labelEdited || label.includes("@")) setLabel(providerLabels[next]);
          }}
        >
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
          <option value="gemini">Gemini</option>
          <option value="openai_compatible">OpenAI compatible</option>
        </select>
      </label>
      <label className="block text-sm">
        API key
        <input name="apiKey" type="password" autoComplete="new-password" required className="field" />
      </label>
      <label className="block text-sm">
        Base URL
        <input name="baseUrl" className="field" placeholder="optional, e.g. https://api.groq.com/openai/v1" />
        <span className="mt-1 block text-xs text-muted-foreground">Leave blank to use the provider default. Gemini uses Google&apos;s OpenAI-compatible endpoint.</span>
      </label>
      <label className="block text-sm">
        Model allowlist
        <input name="models" className="field" placeholder="comma-separated, optional" />
      </label>
      <label className="block text-sm">
        Priority
        <input name="priority" type="number" step="1" defaultValue={0} className="field" />
        <span className="mt-1 block text-xs text-muted-foreground">Lower numbers are tried first.</span>
      </label>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button disabled={pending} className="btn-primary w-full">
        {pending ? "Saving..." : "Save provider"}
      </button>
    </form>
  );
}
