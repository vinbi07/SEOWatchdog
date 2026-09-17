import type { Issue } from "../types/seo.js";
import { createChangeEvent } from "./changeEventFactory.js";
import { buildIssueKey } from "./issueKey.js";
import type { ChangeEvent, PreviousIssueRecord } from "./types.js";

export interface CurrentIssueEntry {
  url: string;
  issue: Issue;
}

export interface IssueComparisonResult {
  changes: ChangeEvent[];
  newCount: number;
  resolvedCount: number;
  ongoingCount: number;
}

/**
 * Compares the current crawl's issues against the previous successful
 * crawl's issues by stable issue key (normalized URL + issue type), and
 * produces new/ongoing/resolved/severity-changed events.
 *
 * Ongoing issues still generate an event (issue_ongoing) so callers that
 * want the full lifecycle have it, but the caller is responsible for not
 * flooding user-facing surfaces with all of them (see printConsoleSummary /
 * dashboard, which only surface a handful).
 */
export function compareIssues(
  currentIssues: CurrentIssueEntry[],
  previousIssues: PreviousIssueRecord[]
): IssueComparisonResult {
  const currentByKey = new Map<string, CurrentIssueEntry>();
  for (const entry of currentIssues) {
    currentByKey.set(buildIssueKey(entry.url, entry.issue.issueType), entry);
  }

  const previousByKey = new Map<string, PreviousIssueRecord>();
  for (const record of previousIssues) {
    previousByKey.set(record.issueKey, record);
  }

  const changes: ChangeEvent[] = [];
  let newCount = 0;
  let resolvedCount = 0;
  let ongoingCount = 0;

  for (const [key, entry] of currentByKey) {
    const previous = previousByKey.get(key);
    if (!previous) {
      newCount += 1;
      changes.push(
        createChangeEvent({
          eventType: "issue_new",
          entityType: "issue",
          url: entry.url,
          issueKey: key,
          severity: entry.issue.severity,
          currentValue: { severity: entry.issue.severity, message: entry.issue.message },
          message: `New issue: ${entry.issue.message}`,
        })
      );
      continue;
    }

    if (previous.severity !== entry.issue.severity) {
      changes.push(
        createChangeEvent({
          eventType: "severity_changed",
          entityType: "issue",
          url: entry.url,
          issueKey: key,
          severity: entry.issue.severity,
          previousValue: previous.severity,
          currentValue: entry.issue.severity,
          message: `${entry.issue.issueType} severity changed: ${previous.severity} -> ${entry.issue.severity}`,
        })
      );
    }

    ongoingCount += 1;
    changes.push(
      createChangeEvent({
        eventType: "issue_ongoing",
        entityType: "issue",
        url: entry.url,
        issueKey: key,
        severity: entry.issue.severity,
        currentValue: { severity: entry.issue.severity, message: entry.issue.message },
        message: entry.issue.message,
      })
    );
  }

  for (const [key, previous] of previousByKey) {
    if (currentByKey.has(key)) continue;
    resolvedCount += 1;
    changes.push(
      createChangeEvent({
        eventType: "issue_resolved",
        entityType: "issue",
        url: previous.url,
        issueKey: key,
        severity: previous.severity,
        previousValue: { severity: previous.severity },
        message: `${previous.issueType} resolved.`,
      })
    );
  }

  return { changes, newCount, resolvedCount, ongoingCount };
}
