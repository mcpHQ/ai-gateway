"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { encryptSecret, generateApiKey } from "@/lib/crypto";
import { db } from "@/lib/db";
import { cookies } from "next/headers";
import { apiKeys, gateways, modelPrices, providers } from "@/lib/db/schema";
import { requireOrg } from "@/lib/org";
import { createGatewayRecord, requireGateway } from "@/lib/gateway";

const providerTypes = new Set(["openai", "anthropic", "gemini", "openai_compatible"]);
const providerLabels: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Gemini",
  openai_compatible: "Compatible",
};

export async function createProvider(formData: FormData) {
  const { org } = await requireOrg();
  const typedName = String(formData.get("providerLabel") || formData.get("name") || "").trim();
  const type = String(formData.get("type") || "").trim();
  const name = !typedName || typedName.includes("@") ? providerLabels[type] || "Provider" : typedName;
  const apiKey = String(formData.get("apiKey") || "").trim();
  const baseUrl = String(formData.get("baseUrl") || "").trim();
  const models = String(formData.get("models") || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const priorityRaw = String(formData.get("priority") || "0").trim();
  const priority = Number(priorityRaw);

  if (!name || !providerTypes.has(type) || !apiKey) {
    return { error: "Name, provider type, and API key are required." };
  }
  if (!Number.isInteger(priority)) {
    return { error: "Priority must be an integer. Lower numbers are tried first." };
  }

  await db.insert(providers).values({
    id: crypto.randomUUID(),
    organizationId: org.id,
    name,
    type,
    baseUrl: baseUrl || null,
    encryptedApiKey: encryptSecret(apiKey),
    modelsJson: JSON.stringify(models),
    priority,
  });
  revalidatePath("/dashboard/providers");
  return { ok: true };
}

export async function rotateProviderKey(providerId: string, formData: FormData) {
  const { org } = await requireOrg();
  const apiKey = String(formData.get("apiKey") || "").trim();
  if (!apiKey) return { error: "API key is required." };
  await db
    .update(providers)
    .set({ encryptedApiKey: encryptSecret(apiKey), updatedAt: new Date() })
    .where(and(eq(providers.id, providerId), eq(providers.organizationId, org.id)));
  revalidatePath("/dashboard/providers");
  return { ok: true };
}

export async function deleteProvider(providerId: string) {
  const { org } = await requireOrg();
  await db.delete(providers).where(and(eq(providers.id, providerId), eq(providers.organizationId, org.id)));
  revalidatePath("/dashboard/providers");
}

export async function createApiKey(formData: FormData) {
  const { org, gateway } = await requireGateway();
  const name = String(formData.get("name") || "").trim();
  const budgetRaw = String(formData.get("budgetUsd") || "").trim();
  const rpmRaw = String(formData.get("requestsPerMinute") || "").trim();
  if (!name) {
    return { error: "Name is required." };
  }
  const generated = generateApiKey();
  const budget = budgetRaw ? Math.round(Number(budgetRaw) * 100) : null;
  if (budgetRaw && !Number.isFinite(budget)) {
    return { error: "Budget must be a number in USD." };
  }
  const requestsPerMinute = rpmRaw ? Number(rpmRaw) : null;
  if (rpmRaw && (!Number.isInteger(requestsPerMinute) || (requestsPerMinute ?? 0) < 1)) {
    return { error: "Requests per minute must be a positive integer." };
  }
  await db.insert(apiKeys).values({
    id: crypto.randomUUID(),
    organizationId: org.id,
    gatewayId: gateway.id,
    name,
    keyHash: generated.hash,
    keyPrefix: generated.prefix,
    monthlyBudgetCents: budget,
    requestsPerMinute,
    periodStart: new Date(),
  });
  revalidatePath("/dashboard/keys");
  return { ok: true, key: generated.raw };
}

export async function setApiKeyDisabled(id: string, disabled: boolean) {
  const { org } = await requireOrg();
  await db
    .update(apiKeys)
    .set({ disabled })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.organizationId, org.id)));
  revalidatePath("/dashboard/keys");
}

export async function deleteApiKey(id: string) {
  const { org } = await requireOrg();
  await db.delete(apiKeys).where(and(eq(apiKeys.id, id), eq(apiKeys.organizationId, org.id)));
  revalidatePath("/dashboard/keys");
}

export async function savePriceOverride(formData: FormData) {
  const { org } = await requireOrg();
  const model = String(formData.get("model") || "").trim();
  const inputPerMillion = String(formData.get("inputPerMillion") || "").trim();
  const outputPerMillion = String(formData.get("outputPerMillion") || "").trim();
  if (!model || !inputPerMillion || !outputPerMillion) {
    return { error: "Model and both prices are required." };
  }
  const match = await db.query.modelPrices.findFirst({
    where: (table, { and, eq }) => and(eq(table.organizationId, org.id), eq(table.model, model)),
  });
  if (match) {
    await db
      .update(modelPrices)
      .set({
        inputPerMillion,
        outputPerMillion,
        updatedAt: new Date(),
      })
      .where(eq(modelPrices.id, match.id));
  } else {
    await db.insert(modelPrices).values({
      id: crypto.randomUUID(),
      organizationId: org.id,
      model,
      inputPerMillion,
      outputPerMillion,
    });
  }
  revalidatePath("/dashboard/calculator");
  revalidatePath("/dashboard/settings");
  return { ok: true };
}

export async function createNamedGateway(formData: FormData) {
  const { org } = await requireOrg();
  const name = String(formData.get("name") || "").trim();
  if (!name) return { error: "Name is required." };
  const gateway = await createGatewayRecord(org.id, name);
  (await cookies()).set("ai-gateway-id", gateway.id, { httpOnly: true, sameSite: "lax", path: "/" });
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function selectGateway(id: string) {
  const { org } = await requireOrg();
  const gateway = await db.query.gateways.findFirst({
    where: (table, { and, eq }) => and(eq(table.id, id), eq(table.organizationId, org.id)),
  });
  if (!gateway) return;
  (await cookies()).set("ai-gateway-id", gateway.id, { httpOnly: true, sameSite: "lax", path: "/" });
  revalidatePath("/dashboard");
}

export async function saveGatewaySettings(formData: FormData) {
  const { gateway } = await requireGateway();
  const budgetRaw = String(formData.get("budgetUsd") || "").trim();
  const cacheRaw = String(formData.get("cacheTtlSeconds") || "").trim();
  const fallbacks = String(formData.get("fallbacks") || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const budget = budgetRaw ? Math.round(Number(budgetRaw) * 100) : null;
  if (budgetRaw && !Number.isFinite(budget)) {
    return { error: "Gateway budget must be a number in USD." };
  }
  const cacheTtlSeconds = cacheRaw ? Number(cacheRaw) : null;
  if (cacheRaw && (!Number.isInteger(cacheTtlSeconds) || (cacheTtlSeconds ?? 0) < 60)) {
    return { error: "Cache TTL must be at least 60 seconds." };
  }
  const cacheMode = String(formData.get("cacheMode") || "exact") === "semantic" ? "semantic" : "exact";
  const similarityRaw = String(formData.get("similarity") || "0.95").trim();
  const similarity = Number(similarityRaw);
  if (!Number.isFinite(similarity) || similarity < 0.8 || similarity > 0.99) {
    return { error: "Similarity must be between 0.80 and 0.99." };
  }
  const guardActionRaw = String(formData.get("guardAction") || "flag");
  const guardAction = guardActionRaw === "off" || guardActionRaw === "block" ? guardActionRaw : "flag";
  await db
    .update(gateways)
    .set({
      monthlyBudgetCents: budget,
      cacheTtlSeconds,
      cacheMode,
      similarityThreshold: similarity.toFixed(2),
      guardAction,
      fallbacksJson: JSON.stringify(fallbacks),
      updatedAt: new Date(),
    })
    .where(eq(gateways.id, gateway.id));
  revalidatePath("/dashboard/settings");
  return { ok: true };
}
