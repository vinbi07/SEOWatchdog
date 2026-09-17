import type { CrawlReport } from "../types/seo.js";
import type { Bonus } from "./types.js";

function findHomepage(report: CrawlReport) {
  return report.pages.find((p) => p.pageType === "homepage") ?? null;
}

/**
 * Deterministic positive-signal checks. Each signal is a simple boolean over
 * already-collected crawl data — no new network calls, no guessing. Bonuses
 * are summed per category by the caller and capped there
 * (MAX_POSITIVE_SIGNAL_BONUS_PER_CATEGORY in config.ts) so a site with
 * serious issues can never coast to 100 purely on minor positives.
 */
export function computePositiveSignals(report: CrawlReport): Bonus[] {
  const bonuses: Bonus[] = [];
  const pages = report.pages;
  const homepage = findHomepage(report);

  if (homepage && homepage.finalUrl.startsWith("https://")) {
    bonuses.push({ signal: "https_enabled", category: "technical", bonus: 2 });
  }

  const hasCanonicalIssue = pages.some((p) => p.issues.some((i) => i.issueType === "missing_canonical" || i.issueType === "canonical_external_domain"));
  if (!hasCanonicalIssue) {
    bonuses.push({ signal: "valid_canonicals", category: "onPage", bonus: 2 });
  }

  if (report.indexing.noindexUnexpected === 0) {
    bonuses.push({ signal: "no_unexpected_noindex", category: "indexing", bonus: 3 });
  }

  if (report.discovery.indexableMissingFromSitemap === 0 && report.discovery.orphanedSitemapPages === 0) {
    bonuses.push({ signal: "valid_sitemap_coverage", category: "indexing", bonus: 2 });
  }

  const hasBrokenLinks = pages.some((p) => p.brokenInternalLinks.length > 0);
  if (!hasBrokenLinks) {
    bonuses.push({ signal: "no_broken_links", category: "internalLinks", bonus: 3 });
  }

  const episodePages = pages.filter((p) => p.pageType === "episode");
  if (episodePages.length > 0 && episodePages.every((p) => !p.issues.some((i) => i.issueType === "missing_podcast_episode_schema"))) {
    bonuses.push({ signal: "structured_data_present", category: "content", bonus: 2 });
  }

  if (pages.length > 0 && pages.every((p) => p.images.missingAlt === 0)) {
    bonuses.push({ signal: "all_images_have_alt_text", category: "onPage", bonus: 2 });
  }

  if (pages.length > 0 && pages.every((p) => p.hasViewport)) {
    bonuses.push({ signal: "valid_viewport", category: "technical", bonus: 1 });
  }

  if (pages.length > 0 && pages.every((p) => Boolean(p.lang))) {
    bonuses.push({ signal: "valid_lang_tag", category: "onPage", bonus: 1 });
  }

  return bonuses;
}
