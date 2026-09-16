import type { Issue, IndexingState, PageResult } from "../types/seo.js";
import { indexingRules } from "./indexingRules.js";

export interface IndexingAnalysis {
  indexingState: IndexingState;
  issues: Issue[];
}

/**
 * Decides whether a page's noindex status is expected, and produces any
 * issue that decision implies. Deliberately does NOT treat every noindex
 * page as an error — most noindex pages found by discovery are
 * intentional (utility pages, unreleased content), and flooding the
 * report with those would drown out real problems.
 *
 * `sitemap_url_noindex` (a sitemap URL that is itself noindex) is handled
 * separately in rules.ts, since that's a per-page rule independent of
 * publication-state reasoning; this function reports it as
 * "noindex_unexpected" for consistency but does not duplicate that issue.
 */
export function analyzeIndexingState(page: PageResult): IndexingAnalysis {
  if (page.outcome !== "ok") {
    return { indexingState: "indexable", issues: [] };
  }

  if (!page.noindex) {
    return { indexingState: "indexable", issues: [] };
  }

  // A sitemap normally represents "please index this" — noindex there is
  // always unexpected, regardless of publication-state evidence. The
  // corresponding issue is raised by the sitemap_url_noindex rule instead.
  if (page.sources.sitemap) {
    return { indexingState: "noindex_unexpected", issues: [] };
  }

  const rule = indexingRules[page.pageType];
  if (!rule) {
    // No site-specific expectations for this page type: assume the
    // noindex is intentional rather than generating noise.
    return { indexingState: "noindex_expected", issues: [] };
  }

  if (rule.requireIndexableWhenPublicationState.includes(page.publicationState)) {
    return {
      indexingState: "noindex_unexpected",
      issues: [
        {
          issueType: "unexpected_noindex",
          severity: "high",
          message: "Published episode page is marked noindex and may be excluded from search results.",
          recommendation: "Remove the noindex directive if this episode is intended to appear in organic search.",
          url: page.url,
          value: page.publicationState,
        },
      ],
    };
  }

  if (rule.allowNoindexWhenPublicationState.includes(page.publicationState)) {
    return { indexingState: "noindex_expected", issues: [] };
  }

  return {
    indexingState: "noindex_review",
    issues: [
      {
        issueType: "noindex_requires_review",
        severity: "low",
        message: "Page is noindex and its publication state could not be determined; worth a manual check.",
        recommendation: "Confirm whether this page should be indexed once its release/publication status is known.",
        url: page.url,
        value: page.publicationState,
      },
    ],
  };
}
