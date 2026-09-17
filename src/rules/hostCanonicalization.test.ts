import { beforeEach, describe, expect, it, vi } from "vitest";

const getMock = vi.fn();
vi.mock("axios", () => ({
  default: { get: (...args: unknown[]) => getMock(...args) },
}));

const { checkHostCanonicalization } = await import("./hostCanonicalization.js");

describe("checkHostCanonicalization", () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it("is healthy when the non-preferred host redirects to the preferred host", async () => {
    getMock.mockResolvedValue({
      status: 301,
      headers: { location: "https://thesickestpodcast.com/" },
    });

    const result = await checkHostCanonicalization("https://thesickestpodcast.com");
    expect(result.issue).toBeNull();
    expect(result.summary.wwwRedirectStatus).toBe(301);
    expect(result.summary.preferredHost).toBe("thesickestpodcast.com");
  });

  it("flags both hosts serving independent 200 responses", async () => {
    getMock.mockResolvedValue({ status: 200, headers: {} });

    const result = await checkHostCanonicalization("https://thesickestpodcast.com");
    expect(result.issue?.issueType).toBe("host_canonicalization_issue");
    expect(result.issue?.severity).toBe("high");
  });

  it("is inconclusive (no issue) on a network failure, and records no status", async () => {
    getMock.mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await checkHostCanonicalization("https://thesickestpodcast.com");
    expect(result.issue).toBeNull();
    expect(result.summary.wwwRedirectStatus).toBeNull();
  });

  it("is inconclusive when the alt host redirects somewhere other than the preferred host", async () => {
    getMock.mockResolvedValue({
      status: 302,
      headers: { location: "https://somewhere-else.example.com/" },
    });

    const result = await checkHostCanonicalization("https://thesickestpodcast.com");
    expect(result.issue).toBeNull();
  });
});
