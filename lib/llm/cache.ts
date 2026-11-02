import { createHash } from "node:crypto";

export function responseCacheKey(input: {
  organizationId: string;
  apiKeyId: string;
  endpoint: string;
  providerType: string;
  model: string;
  upstreamBody: unknown;
}) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        organizationId: input.organizationId,
        apiKeyId: input.apiKeyId,
        endpoint: input.endpoint,
        providerType: input.providerType,
        model: input.model,
        body: input.upstreamBody,
      }),
    )
    .digest("hex");
}

export function resolveCacheTtl(requestTtl: number | null, orgDefault: number | null) {
  if (requestTtl != null) {
    if (!Number.isFinite(requestTtl) || requestTtl <= 0) {
      return null;
    }
    return Math.max(60, Math.floor(requestTtl));
  }
  if (orgDefault != null && orgDefault > 0) {
    return Math.max(60, Math.floor(orgDefault));
  }
  return null;
}
