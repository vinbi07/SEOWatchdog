import { describe, expect, it } from "vitest";
import { estimatePixelWidth } from "./pixelWidth.js";

describe("estimatePixelWidth", () => {
  it("estimates wide characters as wider than narrow ones", () => {
    const wide = estimatePixelWidth("WWWWWWWWWW");
    const narrow = estimatePixelWidth("iiiiiiiiii");
    expect(wide).toBeGreaterThan(narrow);
  });

  it("returns 0 for empty/null input", () => {
    expect(estimatePixelWidth("")).toBe(0);
    expect(estimatePixelWidth(null)).toBe(0);
    expect(estimatePixelWidth(undefined)).toBe(0);
  });

  it("increases roughly with length for the same character", () => {
    expect(estimatePixelWidth("aaaa")).toBeGreaterThan(estimatePixelWidth("aa"));
  });

  it("a 62-character title of narrow glyphs can stay under the SERP width threshold", () => {
    const title = "i".repeat(62);
    expect(estimatePixelWidth(title)).toBeLessThan(600);
  });

  it("a title of wide glyphs at a similar length can exceed the SERP width threshold", () => {
    const title = "W".repeat(62);
    expect(estimatePixelWidth(title)).toBeGreaterThan(600);
  });
});
