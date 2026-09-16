import { describe, expect, it } from "vitest";
import { determinePublicationState } from "./publicationState.js";

describe("determinePublicationState", () => {
  it("defaults to unknown when there is no structured data evidence", () => {
    expect(determinePublicationState([])).toBe("unknown");
  });

  it("defaults to unknown when PodcastEpisode has no datePublished", () => {
    expect(determinePublicationState([{ type: "PodcastEpisode" }])).toBe("unknown");
  });

  it("returns published when datePublished is in the past", () => {
    const now = new Date("2026-09-16T00:00:00Z");
    const state = determinePublicationState([{ type: "PodcastEpisode", datePublished: "2026-01-01" }], now);
    expect(state).toBe("published");
  });

  it("returns scheduled when datePublished is in the future", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const state = determinePublicationState([{ type: "PodcastEpisode", datePublished: "2026-09-16" }], now);
    expect(state).toBe("scheduled");
  });

  it("defaults to unknown for an unparsable datePublished", () => {
    const state = determinePublicationState([{ type: "PodcastEpisode", datePublished: "not-a-date" }]);
    expect(state).toBe("unknown");
  });
});
