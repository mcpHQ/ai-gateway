import { calculateCostMicros, type PriceOverride } from "@/lib/cost/catalog";

export type TokenTotals = {
  model: string;
  promptTokens: number;
  completionTokens: number;
};

export function responseCacheSavedMicros(rows: TokenTotals[], overrides: PriceOverride[] = []) {
  return rows.reduce(
    (sum, row) =>
      sum +
      calculateCostMicros({
        model: row.model,
        promptTokens: row.promptTokens,
        completionTokens: row.completionTokens,
        overrides,
      }),
    0,
  );
}

export function promptCacheSavedMicros(rows: Array<{ model: string; cacheReadTokens: number }>, overrides: PriceOverride[] = []) {
  return rows.reduce((sum, row) => {
    const full = calculateCostMicros({
      model: row.model,
      promptTokens: row.cacheReadTokens,
      completionTokens: 0,
      overrides,
    });
    const billed = calculateCostMicros({
      model: row.model,
      promptTokens: 0,
      completionTokens: 0,
      cacheReadTokens: row.cacheReadTokens,
      overrides,
    });
    return sum + Math.max(0, full - billed);
  }, 0);
}
