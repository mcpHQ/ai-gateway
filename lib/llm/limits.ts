import { ProxyError, type GatewayKey } from "@/lib/llm/types";

export function assertBudgets(
  key: Pick<GatewayKey, "monthlyBudgetCents" | "periodSpendMicros" | "orgMonthlyBudgetCents" | "orgPeriodSpendMicros"> &
    Pick<GatewayKey, "gatewayMonthlyBudgetCents" | "gatewayPeriodSpendMicros">,
) {
  if (
    overBudget(key.monthlyBudgetCents, key.periodSpendMicros) ||
    overBudget(key.orgMonthlyBudgetCents, key.orgPeriodSpendMicros) ||
    overBudget(key.gatewayMonthlyBudgetCents ?? null, key.gatewayPeriodSpendMicros ?? 0)
  ) {
    throw new ProxyError(402, "Monthly budget exceeded");
  }
}

export function minuteWindowStart(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), now.getUTCMinutes(), 0, 0));
}

export function retryAfterSeconds(now: Date) {
  return Math.max(1, 60 - now.getUTCSeconds());
}

function overBudget(cents: number | null, micros: number) {
  return cents != null && micros >= cents * 10_000;
}
