import { normalizeUrlForComparison } from "./normalizeForComparison.js";

/**
 * Stable identity for a logical issue across crawls: normalized URL + issue
 * type. Deliberately not a random id, so the same real-world issue matches
 * between two crawl runs even though each crawl gets fresh row ids.
 */
export function buildIssueKey(url: string, issueType: string): string {
  return `${normalizeUrlForComparison(url)}::${issueType}`;
}
