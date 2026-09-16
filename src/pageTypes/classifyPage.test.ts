import { describe, expect, it } from "vitest";
import { classifyPage } from "./classifyPage.js";

describe("classifyPage", () => {
  it("classifies the root URL as homepage", () => {
    expect(classifyPage("https://example.com/")).toBe("homepage");
  });

  it("classifies /episodes as episodes_index", () => {
    expect(classifyPage("https://example.com/episodes")).toBe("episodes_index");
  });

  it("classifies /episodes/<slug> as episode", () => {
    expect(classifyPage("https://example.com/episodes/briana-green-more-than-a-globetrotter")).toBe("episode");
  });

  it("classifies /booking as booking", () => {
    expect(classifyPage("https://example.com/booking")).toBe("booking");
  });

  it("classifies /booking/<slug> as service", () => {
    expect(classifyPage("https://example.com/booking/speaking")).toBe("service");
    expect(classifyPage("https://example.com/booking/keynote")).toBe("service");
    expect(classifyPage("https://example.com/booking/advisory")).toBe("service");
  });

  it("falls back to generic for unrecognized paths", () => {
    expect(classifyPage("https://example.com/about")).toBe("generic");
  });

  it("returns unknown for unparsable URLs", () => {
    expect(classifyPage("not a url")).toBe("unknown");
  });
});
