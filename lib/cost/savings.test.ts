import { describe, expect, it } from "vitest";
import { promptCacheSavedMicros, responseCacheSavedMicros } from "./savings";

describe("cache savings", () => {
  it("prices exact and semantic hits at the full catalog rate", () => {
    expect(
      responseCacheSavedMicros([{ model: "gpt-4o-mini", promptTokens: 1_000_000, completionTokens: 1_000_000 }]),
    ).toBe(750_000);
  });

  it("prices prompt-cache reads at a 90 percent input discount", () => {
    expect(promptCacheSavedMicros([{ model: "gpt-4o-mini", cacheReadTokens: 1_000_000 }])).toBe(75_000);
    expect(promptCacheSavedMicros([{ model: "claude-sonnet-4-5", cacheReadTokens: 1_000_000 }])).toBe(2_700_000);
  });
});
