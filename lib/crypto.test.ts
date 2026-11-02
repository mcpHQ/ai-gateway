import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, generateApiKey, hashApiKey } from "./crypto";

process.env.ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("secrets", () => {
  it("round-trips provider secrets", () => {
    const encrypted = encryptSecret("sk-test");
    expect(encrypted).not.toContain("sk-test");
    expect(decryptSecret(encrypted)).toBe("sk-test");
  });

  it("hashes API keys and never stores the raw value", () => {
    const generated = generateApiKey();
    expect(generated.raw.startsWith("sk_live_")).toBe(true);
    expect(generated.hash).toBe(hashApiKey(generated.raw));
    expect(generated.prefix).toBe(generated.raw.slice(0, 12));
  });
});
