"use client";

import { useMemo, useState } from "react";
import { calculateCostMicros, formatUsd, type ModelPrice, type PriceOverride } from "@/lib/cost/catalog";

export function Calculator({ models, overrides }: { models: ModelPrice[]; overrides: PriceOverride[] }) {
  const [model, setModel] = useState(models[0]?.id || "gpt-4o-mini");
  const [promptTokens, setPromptTokens] = useState("1000");
  const [completionTokens, setCompletionTokens] = useState("500");

  const micros = useMemo(
    () =>
      calculateCostMicros({
        model,
        promptTokens: Number(promptTokens) || 0,
        completionTokens: Number(completionTokens) || 0,
        overrides,
      }),
    [model, promptTokens, completionTokens, overrides],
  );

  return (
    <div className="panel p-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block text-sm">
          Model
          <select value={model} onChange={(event) => setModel(event.target.value)} className="field">
            {models.map((item) => (
              <option key={item.id} value={item.id}>
                {item.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Prompt tokens
          <input
            value={promptTokens}
            onChange={(event) => setPromptTokens(event.target.value)}
            className="field"
          />
        </label>
        <label className="block text-sm">
          Completion tokens
          <input
            value={completionTokens}
            onChange={(event) => setCompletionTokens(event.target.value)}
            className="field"
          />
        </label>
      </div>
      <p className="mt-6 text-3xl font-semibold">{formatUsd(micros)}</p>
      <p className="mt-1 text-sm text-muted-foreground">Estimated cost for a single request.</p>
    </div>
  );
}
