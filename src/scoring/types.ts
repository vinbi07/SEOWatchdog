import type { Severity } from "../types/seo.js";

export type ScoreCategory = "technical" | "onPage" | "content" | "internalLinks" | "indexing" | "performance";

export interface PenaltyLineItem {
  issueType: string;
  category: ScoreCategory;
  severity: Severity;
  occurrences: number;
  totalPenalty: number;
}

export interface Bonus {
  signal: string;
  category: ScoreCategory;
  bonus: number;
}

export interface SafetyCapContext {
  hasCriticalIssue: boolean;
  homepageServerError: boolean;
  homepageUnexpectedNoindex: boolean;
  /** Fraction (0-1) of crawled pages whose outcome was not "ok". */
  uncrawlableRatio: number;
}

export interface CategoryBreakdown {
  category: ScoreCategory;
  weight: number;
  startingScore: number;
  penalties: PenaltyLineItem[];
  bonuses: Bonus[];
  finalScore: number;
  /** finalScore * weight — this category's contribution to overallScoreRaw. */
  contribution: number;
}

export interface ScoreResult {
  /** Rounded, safety-capped — the number to display. */
  overallScore: number;
  /** Unrounded, pre-cap weighted sum — kept for trend precision. */
  overallScoreRaw: number;
  categories: Record<ScoreCategory, CategoryBreakdown>;
  safetyCapApplied: string | null;
  /** overallScore - previousScore, or null when no previous score was supplied. */
  scoreDelta: number | null;
  /** Mirrors the crawl report's finish time — never Date.now(), keeps the result reproducible. */
  generatedAt: string;
}
