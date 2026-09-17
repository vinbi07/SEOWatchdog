import { describe, expect, it } from "vitest";
import type { Issue } from "../types/seo.js";
import { compareIssues, type CurrentIssueEntry } from "./compareIssues.js";
import { buildIssueKey } from "./issueKey.js";
import type { PreviousIssueRecord } from "./types.js";

const URL = "https://example.com/booking";

function issue(overrides: Partial<Issue> = {}): Issue {
  return {
    issueType: "missing_h1",
    severity: "medium",
    message: "Missing H1 detected.",
    recommendation: "Add an H1.",
    url: URL,
    ...overrides,
  };
}

function previous(overrides: Partial<PreviousIssueRecord> = {}): PreviousIssueRecord {
  return {
    issueKey: buildIssueKey(URL, "missing_h1"),
    url: URL,
    issueType: "missing_h1",
    severity: "medium",
    ...overrides,
  };
}

describe("compareIssues", () => {
  it("detects a new issue absent from the previous crawl", () => {
    const current: CurrentIssueEntry[] = [{ url: URL, issue: issue() }];
    const result = compareIssues(current, []);
    expect(result.newCount).toBe(1);
    expect(result.resolvedCount).toBe(0);
    expect(result.changes.some((c) => c.eventType === "issue_new")).toBe(true);
  });

  it("detects an ongoing issue present in both crawls", () => {
    const current: CurrentIssueEntry[] = [{ url: URL, issue: issue() }];
    const result = compareIssues(current, [previous()]);
    expect(result.ongoingCount).toBe(1);
    expect(result.newCount).toBe(0);
    expect(result.changes.some((c) => c.eventType === "issue_ongoing")).toBe(true);
  });

  it("detects a resolved issue no longer present", () => {
    const result = compareIssues([], [previous()]);
    expect(result.resolvedCount).toBe(1);
    expect(result.changes.some((c) => c.eventType === "issue_resolved")).toBe(true);
  });

  it("detects a severity change on the same issue key", () => {
    const current: CurrentIssueEntry[] = [{ url: URL, issue: issue({ severity: "high" }) }];
    const result = compareIssues(current, [previous({ severity: "medium" })]);
    const severityChange = result.changes.find((c) => c.eventType === "severity_changed");
    expect(severityChange).toBeDefined();
    expect(severityChange?.previousValue).toBe("medium");
    expect(severityChange?.currentValue).toBe("high");
  });

  it("matches the same logical issue across trailing-slash URL variants", () => {
    const current: CurrentIssueEntry[] = [{ url: `${URL}/`, issue: issue() }];
    const result = compareIssues(current, [previous()]);
    expect(result.ongoingCount).toBe(1);
    expect(result.newCount).toBe(0);
  });
});
