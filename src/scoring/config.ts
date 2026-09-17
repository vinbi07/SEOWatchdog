import type { Severity } from "../types/seo.js";
import type { ScoreCategory, SafetyCapContext } from "./types.js";

/**
 * Every tunable number in the scoring engine lives in this file. Nothing
 * downstream should hardcode a weight, penalty, multiplier, or threshold —
 * see README "Step 2.7" for the philosophy behind these values.
 */

export const CATEGORY_WEIGHTS: Record<ScoreCategory, number> = {
  technical: 0.2,
  onPage: 0.2,
  content: 0.15,
  internalLinks: 0.15,
  indexing: 0.2,
  performance: 0.1,
};

export const SEVERITY_BASE_PENALTY: Record<Severity, number> = {
  critical: 20,
  high: 10,
  medium: 4,
  low: 1,
};

/**
 * Diminishing-returns tiers applied to the Nth (1-indexed) occurrence of a
 * given issueType within a single crawl. This is what keeps one repeated
 * issue across 100 pages from destroying the score: the marginal penalty of
 * each additional occurrence shrinks as the count grows, while the first few
 * occurrences still count close to full weight.
 */
export const DIMINISHING_RETURNS_TIERS: ReadonlyArray<{ maxOccurrence: number; multiplier: number }> = [
  { maxOccurrence: 1, multiplier: 1.0 },
  { maxOccurrence: 5, multiplier: 0.75 },
  { maxOccurrence: 20, multiplier: 0.4 },
  { maxOccurrence: Infinity, multiplier: 0.2 },
];

/** Maximum positive-signal bonus a single category may receive, before clamping the final score to 100. */
export const MAX_POSITIVE_SIGNAL_BONUS_PER_CATEGORY = 5;

export interface SafetyCapDefinition {
  name: string;
  maxScore: number;
  test: (ctx: SafetyCapContext) => boolean;
}

/**
 * Safety caps prevent a site with a catastrophic technical failure from
 * reading as "healthy" just because unrelated categories score well. Every
 * cap whose test() passes is considered; the lowest resulting ceiling wins
 * (see safetyCaps.ts), so caps compose safely regardless of declaration order.
 */
export const SAFETY_CAPS: ReadonlyArray<SafetyCapDefinition> = [
  { name: "any_critical_issue", maxScore: 69, test: (ctx) => ctx.hasCriticalIssue },
  { name: "homepage_5xx", maxScore: 50, test: (ctx) => ctx.homepageServerError },
  { name: "homepage_unexpected_noindex", maxScore: 40, test: (ctx) => ctx.homepageUnexpectedNoindex },
  { name: "site_uncrawlable", maxScore: 20, test: (ctx) => ctx.uncrawlableRatio >= 0.9 },
];

export const SCORE_LABEL_THRESHOLDS: ReadonlyArray<{ min: number; label: string }> = [
  { min: 90, label: "Excellent" },
  { min: 80, label: "Healthy" },
  { min: 70, label: "Needs Attention" },
  { min: 50, label: "Poor" },
  { min: 0, label: "Critical" },
];

export function scoreLabelFor(score: number): string {
  for (const tier of SCORE_LABEL_THRESHOLDS) {
    if (score >= tier.min) return tier.label;
  }
  return SCORE_LABEL_THRESHOLDS[SCORE_LABEL_THRESHOLDS.length - 1].label;
}
