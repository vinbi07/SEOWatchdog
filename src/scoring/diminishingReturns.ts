import { DIMINISHING_RETURNS_TIERS } from "./config.js";

/**
 * Returns the penalty multiplier for the Nth (1-indexed) occurrence of an
 * issueType within a single crawl. Occurrence 1 counts near-full; later
 * occurrences count for progressively less, so a widespread issue still
 * matters more than a one-page issue without letting volume alone drive the
 * score to 0.
 */
export function occurrenceMultiplier(occurrenceIndexOneBased: number): number {
  for (const tier of DIMINISHING_RETURNS_TIERS) {
    if (occurrenceIndexOneBased <= tier.maxOccurrence) return tier.multiplier;
  }
  return DIMINISHING_RETURNS_TIERS[DIMINISHING_RETURNS_TIERS.length - 1].multiplier;
}

/**
 * Counts how many times each issueType occurs across every page in the
 * crawl. This is what gives cross-page duplicate issues (duplicate_title,
 * orphaned_sitemap_page, etc., which attach the same issueType to every
 * affected URL) their diminishing-returns treatment automatically — no
 * per-issue-type special casing required.
 */
export function countOccurrencesByIssueType(pages: ReadonlyArray<{ issues: ReadonlyArray<{ issueType: string }> }>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const page of pages) {
    for (const issue of page.issues) {
      counts.set(issue.issueType, (counts.get(issue.issueType) ?? 0) + 1);
    }
  }
  return counts;
}
