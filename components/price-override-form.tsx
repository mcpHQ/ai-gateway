"use client";

import { useState } from "react";
import { savePriceOverride } from "@/lib/actions";

export function PriceOverrideForm({ models }: { models: string[] }) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  return (
    <form
      className="mt-6 grid gap-3 sm:grid-cols-3"
      action={async (formData) => {
        setPending(true);
        const result = await savePriceOverride(formData);
        setPending(false);
        if (result?.error) {
          setError(result.error);
        } else {
          setError("");
        }
      }}
    >
      <label className="block text-sm">
        Model
        <input list="model-ids" name="model" required className="field" />
        <datalist id="model-ids">
          {models.map((model) => (
            <option key={model} value={model} />
          ))}
        </datalist>
      </label>
      <label className="block text-sm">
        Input / 1M
        <input name="inputPerMillion" required className="field" />
      </label>
      <label className="block text-sm">
        Output / 1M
        <input name="outputPerMillion" required className="field" />
      </label>
      {error ? <p className="sm:col-span-3 text-sm text-red-600">{error}</p> : null}
      <button disabled={pending} className="btn-primary sm:col-span-3">
        {pending ? "Saving..." : "Save override"}
      </button>
    </form>
  );
}
