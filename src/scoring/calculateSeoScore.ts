import type { CrawlReport } from "../types/seo.js";
import { CATEGORY_WEIGHTS, MAX_POSITIVE_SIGNAL_BONUS_PER_CATEGORY } from "./config.js";
import { computeCategoryPenalties } from "./penalties.js";
import { computePositiveSignals } from "./positiveSignals.js";
import { applySafetyCaps, buildSafetyCapContext } from "./safetyCaps.js";
import type { Bonus, CategoryBreakdown, PenaltyLineItem, ScoreCategory, ScoreResult } from "./types.js";

const CATEGORIES: ScoreCategory[] = ["technical", "onPage", "content", "internalLinks", "indexing", "performance"];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function groupBonusesByCategory(bonuses: Bonus[]): Record<ScoreCategory, Bonus[]> {
  const grouped: Record<ScoreCategory, Bonus[]> = { technical: [], onPage: [], content: [], internalLinks: [], indexing: [], performance: [] };
  for (const bonus of bonuses) {
    grouped[bonus.category].push(bonus);
  }
  for (const category of CATEGORIES) {
    grouped[category].sort((a, b) => a.signal.localeCompare(b.signal));
  }
  return grouped;
}

/**
 * Computes the deterministic 0-100 overall SEO score for a crawl report.
 * Pure function: no I/O, no Date.now(), no randomness — identical input
 * always produces identical output (see calculateSeoScore.test.ts).
 *
 * previousScore, when supplied, is the prior crawl's persisted
 * overall_score (a plain number), not a ComparisonSummary — the comparison
 * summary only carries issue/page diff counts, not a prior numeric score.
 */
export function calculateSeoScore(report: CrawlReport, previousScore?: number): ScoreResult {
  const penaltiesByCategory = computeCategoryPenalties(report.pages);
  const bonusesByCategory = groupBonusesByCategory(computePositiveSignals(report));

  const categories = {} as Record<ScoreCategory, CategoryBreakdown>;
  let overallScoreRaw = 0;

  for (const category of CATEGORIES) {
    const penalties: PenaltyLineItem[] = penaltiesByCategory[category].slice().sort((a, b) => a.issueType.localeCompare(b.issueType));
    const bonuses: Bonus[] = bonusesByCategory[category];

    const totalPenalty = penalties.reduce((sum, p) => sum + p.totalPenalty, 0);
    const rawBonus = bonuses.reduce((sum, b) => sum + b.bonus, 0);
    const cappedBonus = Math.min(rawBonus, MAX_POSITIVE_SIGNAL_BONUS_PER_CATEGORY);

    const finalScore = clamp(100 - totalPenalty + cappedBonus, 0, 100);
    const weight = CATEGORY_WEIGHTS[category];
    const contribution = finalScore * weight;

    categories[category] = {
      category,
      weight,
      startingScore: 100,
      penalties,
      bonuses,
      finalScore,
      contribution,
    };

    overallScoreRaw += contribution;
  }

  const safetyCapContext = buildSafetyCapContext(report);
  const { cappedScore, capApplied } = applySafetyCaps(overallScoreRaw, safetyCapContext);
  const overallScore = Math.round(cappedScore);

  return {
    overallScore,
    overallScoreRaw,
    categories,
    safetyCapApplied: capApplied,
    scoreDelta: previousScore == null ? null : overallScore - previousScore,
    generatedAt: report.crawlFinishedAt,
  };
}
