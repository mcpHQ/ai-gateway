import { describe, expect, it } from "vitest";
import { signupAllowed } from "./signup";

describe("single account", () => {
  it("allows signup only when no account exists", () => {
    expect(signupAllowed(0)).toBe(true);
    expect(signupAllowed(1)).toBe(false);
  });
});
