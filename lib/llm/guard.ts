import { createEngine } from "@secretlint/node";
import "@secretlint/secretlint-rule-preset-recommend";
import { ProxyError, type GuardAction, type RequestLog } from "@/lib/llm/types";

export type GuardFinding = { code: "prompt_injection" | "secret" | "payment_card" };

const INJECTION = /ignore (?:all |any |the )?(?:previous|prior|above) (?:instructions|prompts|rules)|disregard (?:your|the|all) (?:instructions|rules|guidelines)|reveal (?:your|the) (?:system prompt|hidden prompt|initial instructions)|override (?:the|your) system (?:prompt|instructions)/i;

type SecretLintEngine = Awaited<ReturnType<typeof createEngine>>;

let enginePromise: Promise<SecretLintEngine> | undefined;

function secretlintEngine() {
  enginePromise ??= createEngine({
    configFileJSON: {
      rules: [{ id: "@secretlint/secretlint-rule-preset-recommend" }],
    },
    formatter: "json",
    color: false,
    maskSecrets: true,
  }).catch((error: unknown) => {
    enginePromise = undefined;
    throw error;
  });
  return enginePromise;
}

export function normalizeGuardAction(value: string | null | undefined): GuardAction {
  if (value === "off" || value === "block" || value === "flag") return value;
  return "flag";
}

export function collectText(value: unknown, limit = 50_000) {
  const parts: string[] = [];
  walk(value, parts, 0);
  return parts.join("\n").slice(0, limit);
}

export async function inspectText(text: string): Promise<GuardFinding[]> {
  if (!text.trim()) return [];
  const findings: GuardFinding[] = [];
  if (INJECTION.test(text)) findings.push({ code: "prompt_injection" });
  if (await hasSecret(text)) findings.push({ code: "secret" });
  if (hasPaymentCard(text)) findings.push({ code: "payment_card" });
  return findings;
}

export async function beginGuard(input: {
  action: GuardAction;
  text: string;
  record: (row: RequestLog) => Promise<void>;
  blockedRow: () => RequestLog;
}) {
  const findings = input.action === "off" ? [] : await inspectText(input.text);
  const record = async (row: RequestLog) =>
    input.record({
      ...row,
      guardAction: findings.length ? input.action : "",
      guardFindings: JSON.stringify(findings.map((item) => item.code)),
    });
  if (input.action === "block" && findings.length) {
    await record(input.blockedRow());
    throw new ProxyError(403, "Request blocked by threat detection", {
      error: {
        message: "Request blocked by threat detection",
        type: "guardrail_error",
        code: "prompt_blocked",
      },
    }, { "x-ai-gateway-guard": "block" });
  }
  return { findings, record };
}

export function markGuard(headers: Headers, action: GuardAction, findings: GuardFinding[]) {
  if (findings.length && action !== "off") headers.set("x-ai-gateway-guard", action);
  return headers;
}

function walk(value: unknown, parts: string[], depth: number) {
  if (depth > 8 || parts.join("\n").length > 50_000) return;
  if (typeof value === "string") {
    parts.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) walk(item, parts, depth + 1);
    return;
  }
  if (value && typeof value === "object") {
    for (const nested of Object.values(value)) walk(nested, parts, depth + 1);
  }
}

async function hasSecret(text: string) {
  const engine = await secretlintEngine();
  const result = await engine.executeOnContent({ content: text, filePath: "request.txt" });
  const report = JSON.parse(result.output) as Array<{ messages?: unknown[] }>;
  return report.some((file) => (file.messages?.length ?? 0) > 0);
}

function hasPaymentCard(text: string) {
  const matches = text.match(/\b(?:\d[ -]*?){13,19}\b/g) || [];
  return matches.some((match) => luhn(match.replace(/\D/g, "")));
}

function luhn(digits: string) {
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let alternate = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (alternate) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}
