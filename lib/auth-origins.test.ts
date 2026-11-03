import { describe, expect, it } from "vitest";
import { originsForRequest, publicBaseUrl } from "./auth-origins";

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

  it("uses the platform hostname when no public URL is set", () => {
    const previousUrl = process.env.BETTER_AUTH_URL;
    const previousRender = process.env.RENDER_EXTERNAL_URL;
    delete process.env.BETTER_AUTH_URL;
    process.env.RENDER_EXTERNAL_URL = "https://ai-gateway.onrender.com/";
    try {
      expect(publicBaseUrl()).toBe("https://ai-gateway.onrender.com");
    } finally {
      if (previousUrl === undefined) delete process.env.BETTER_AUTH_URL;
      else process.env.BETTER_AUTH_URL = previousUrl;
      if (previousRender === undefined) delete process.env.RENDER_EXTERNAL_URL;
      else process.env.RENDER_EXTERNAL_URL = previousRender;
    }
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
