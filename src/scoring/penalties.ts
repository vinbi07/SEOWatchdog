import type { Issue, PageResult } from "../types/seo.js";
import { SEVERITY_BASE_PENALTY } from "./config.js";
import { occurrenceMultiplier } from "./diminishingReturns.js";
import { ISSUE_TYPE_CATEGORY_MAP } from "./issueTypeMap.js";
import type { PenaltyLineItem, ScoreCategory } from "./types.js";

interface FlatIssue {
  url: string;
  issue: Issue;
}

function flattenIssues(pages: ReadonlyArray<PageResult>): FlatIssue[] {
  const flat: FlatIssue[] = [];
  for (const page of pages) {
    for (const issue of page.issues) {
      flat.push({ url: page.url, issue });
    }
  }
  return flat;
}

function emptyCategoryMap<T>(fill: () => T): Record<ScoreCategory, T> {
  return {
    technical: fill(),
    onPage: fill(),
    content: fill(),
    internalLinks: fill(),
    indexing: fill(),
    performance: fill(),
  };
}

/**
 * Computes, per category, one PenaltyLineItem per issueType with the total
 * penalty summed across all of its occurrences in this crawl. Occurrence
 * index is assigned deterministically (issues sorted by URL) so identical
 * input always produces identical output, and diminishing returns apply
 * across every page in the crawl, not per-page.
 */
export function computeCategoryPenalties(pages: ReadonlyArray<PageResult>): Record<ScoreCategory, PenaltyLineItem[]> {
  const flat = flattenIssues(pages);

  const byIssueType = new Map<string, FlatIssue[]>();
  for (const entry of flat) {
    const list = byIssueType.get(entry.issue.issueType);
    if (list) list.push(entry);
    else byIssueType.set(entry.issue.issueType, [entry]);
  }

  const result = emptyCategoryMap<PenaltyLineItem[]>(() => []);

  const issueTypes = Array.from(byIssueType.keys()).sort();
  for (const issueType of issueTypes) {
    const mapping = ISSUE_TYPE_CATEGORY_MAP[issueType];
    if (!mapping) continue; // unmapped/unknown issueType: no penalty, don't crash scoring

    const occurrences = byIssueType.get(issueType)!.slice().sort((a, b) => a.url.localeCompare(b.url));

    let totalPenalty = 0;
    for (let i = 0; i < occurrences.length; i++) {
      const { issue } = occurrences[i];
      const basePenalty = SEVERITY_BASE_PENALTY[issue.severity];
      totalPenalty += basePenalty * mapping.multiplier * occurrenceMultiplier(i + 1);
    }

    // Severity for display purposes: the severity of the first (deterministically ordered) occurrence.
    const severity = occurrences[0].issue.severity;

    result[mapping.category].push({
      issueType,
      category: mapping.category,
      severity,
      occurrences: occurrences.length,
      totalPenalty,
    });
  }

  return result;
}
