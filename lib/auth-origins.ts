const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function originsForRequest(request?: Request) {
  const origins = new Set<string>();
  for (const value of configuredOrigins()) {
    const origin = originOf(value);
    if (origin) origins.add(origin);
  }
  const requestOrigin = originFromRequest(request);
  if (requestOrigin) origins.add(requestOrigin);
  return [...origins];
}

export function publicBaseUrl() {
  const railway = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  const raw =
    process.env.BETTER_AUTH_URL?.trim() ||
    process.env.RENDER_EXTERNAL_URL?.trim() ||
    (railway ? `https://${railway}` : "") ||
    "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

function configuredOrigins() {
  const railway = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  const values = [
    publicBaseUrl(),
    process.env.BETTER_AUTH_URL,
    process.env.RENDER_EXTERNAL_URL,
    railway ? `https://${railway}` : "",
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ];
  const extra = process.env.BETTER_AUTH_TRUSTED_ORIGINS || "";
  return [...values, ...extra.split(",")]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
}

function originFromRequest(request?: Request) {
  if (!request) return null;
  const raw = request.headers.get("origin") || request.headers.get("referer");
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (LOCAL_HOSTS.has(url.hostname)) return url.origin;
  const host = request.headers.get("host")?.split(",")[0]?.trim();
  if (host && url.host === host) return url.origin;
  return null;
}

function originOf(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return value;
  }
}
