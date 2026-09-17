import type { HeadingEntry, Issue } from "../types/seo.js";
import { thresholds } from "./thresholds.js";

function normalizeHeadingText(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Flags heading text repeated 2-3 times on the same page. Deliberately
 * skips groups repeated 4+ times — that pattern is far more likely to be a
 * repeated card/grid component (e.g. a listing of episodes each titled the
 * same generic thing) than a real duplicate-heading problem, and the brief
 * is explicit about preferring false negatives over false positives here.
 */
function findDuplicateHeadingIssues(headings: HeadingEntry[], url: string): Issue[] {
  const groups = new Map<string, HeadingEntry[]>();
  for (const heading of headings) {
    const key = normalizeHeadingText(heading.text);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(heading);
    groups.set(key, list);
  }

  const issues: Issue[] = [];
  for (const [normalized, group] of groups) {
    if (group.length < 2 || group.length > thresholds.headings.maxDuplicateOccurrencesToFlag) continue;
    issues.push({
      issueType: "duplicate_heading_text",
      severity: group.length >= 3 ? "medium" : "low",
      message: `Heading text "${group[0]!.text}" is repeated ${group.length} times on the page.`,
      recommendation: "Use distinct, descriptive heading text for each section of the page.",
      url,
      value: { text: normalized, occurrences: group.length, levels: group.map((h) => h.level) },
    });
  }
  return issues;
}

/**
 * Flags a level skip going *deeper* (e.g. H1 -> H3 with no H2 between
 * them). Levels moving back up (closing a section, e.g. H3 -> H1) are
 * always fine and never flagged.
 */
function findHeadingHierarchySkips(headings: HeadingEntry[], url: string): Issue[] {
  const issues: Issue[] = [];
  let previousLevel: number | null = null;

  for (const heading of headings) {
    if (previousLevel !== null && heading.level > previousLevel + 1) {
      issues.push({
        issueType: "heading_hierarchy_skip",
        severity: "low",
        message: `Heading level skips from H${previousLevel} to H${heading.level} ("${heading.text}") without an intervening level.`,
        recommendation: "Use consecutive heading levels for a clear document outline (e.g. H1 then H2, not H1 then H3).",
        url,
        value: { from: previousLevel, to: heading.level, text: heading.text },
      });
    }
    previousLevel = heading.level;
  }

  return issues;
}

/** Low-severity diagnostic only when the heading count is clearly excessive relative to the page's own content. */
function findExcessiveHeadingsIssue(headings: HeadingEntry[], wordCount: number, url: string): Issue[] {
  const { excessiveHeadingRatio, minHeadingCountForRatioCheck, minWordCountForRatioCheck } = thresholds.headings;
  if (headings.length < minHeadingCountForRatioCheck) return [];
  if (wordCount < minWordCountForRatioCheck) return [];

  const ratio = headings.length / wordCount;
  if (ratio < excessiveHeadingRatio) return [];

  return [
    {
      issueType: "excessive_headings",
      severity: "low",
      message: `Page has ${headings.length} headings for ${wordCount} words of content, a notably high heading-to-content ratio.`,
      recommendation: "Confirm this heading density is intentional (e.g. a listing/grid page) rather than over-structured content.",
      url,
      value: { headingCount: headings.length, wordCount, ratio: Number(ratio.toFixed(3)) },
    },
  ];
}

export function findHeadingIssues(headings: HeadingEntry[], wordCount: number, url: string): Issue[] {
  return [
    ...findDuplicateHeadingIssues(headings, url),
    ...findHeadingHierarchySkips(headings, url),
    ...findExcessiveHeadingsIssue(headings, wordCount, url),
  ];
}
