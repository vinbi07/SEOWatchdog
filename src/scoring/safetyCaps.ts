import type { CrawlReport } from "../types/seo.js";
import { SAFETY_CAPS } from "./config.js";
import type { SafetyCapContext } from "./types.js";

function findHomepage(report: CrawlReport) {
  return report.pages.find((p) => p.pageType === "homepage") ?? null;
}

export function buildSafetyCapContext(report: CrawlReport): SafetyCapContext {
  const pages = report.pages;
  const homepage = findHomepage(report);

  const hasCriticalIssue = pages.some((p) => p.issues.some((i) => i.severity === "critical"));
  const homepageServerError = homepage != null && homepage.status != null && homepage.status >= 500;
  const homepageUnexpectedNoindex = homepage != null && homepage.indexingState === "noindex_unexpected";
  const uncrawlableRatio = pages.length === 0 ? 1 : pages.filter((p) => p.outcome !== "ok").length / pages.length;

  return { hasCriticalIssue, homepageServerError, homepageUnexpectedNoindex, uncrawlableRatio };
}

/**
 * Applies every configured safety cap whose test passes and takes the
 * lowest resulting ceiling (Math.min), so multiple simultaneous caps compose
 * safely regardless of the order they're declared in.
 */
export function applySafetyCaps(rawOverall: number, ctx: SafetyCapContext): { cappedScore: number; capApplied: string | null } {
  let cappedScore = rawOverall;
  let capApplied: string | null = null;

  for (const cap of SAFETY_CAPS) {
    if (cap.test(ctx) && cap.maxScore < cappedScore) {
      cappedScore = cap.maxScore;
      capApplied = cap.name;
    }
  }

  return { cappedScore, capApplied };
}
