import { describe, expect, it } from "vitest";
import { originsForRequest } from "./auth-origins";

describe("auth origins", () => {
  it("trusts localhost on whatever port served the page", () => {
    const request = new Request("http://localhost:4173/api/auth/sign-up/email", {
      headers: {
        origin: "http://localhost:4173",
        host: "localhost:4173",
      },
    });
    expect(originsForRequest(request)).toContain("http://localhost:4173");
  });

  it("trusts the host that received the request", () => {
    const request = new Request("https://gateway.example.com/api/auth/sign-up/email", {
      headers: {
        origin: "https://gateway.example.com",
        host: "gateway.example.com",
      },
    });
    expect(originsForRequest(request)).toContain("https://gateway.example.com");
  });

  it("rejects a browser origin that does not match the host", () => {
    const request = new Request("http://localhost:3000/api/auth/sign-up/email", {
      headers: {
        origin: "https://evil.example",
        host: "localhost:3000",
      },
    });
    expect(originsForRequest(request)).not.toContain("https://evil.example");
  });
});
