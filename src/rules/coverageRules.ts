import type { Issue, PageResult } from "../types/seo.js";
import { config } from "../config/config.js";
import { normalizeUrl } from "../utils/urls.js";

export interface CoverageResult {
  /** Extra issues to merge into each page's own `issues` array, keyed by page.url. */
  issuesByUrl: Map<string, Issue[]>;
  discoveredNotInSitemapCount: number;
  indexableMissingFromSitemapCount: number;
  nonIndexableMissingFromSitemapCount: number;
  orphanedSitemapPageCount: number;
}

function hasSelfCanonical(page: PageResult): boolean {
  if (!page.canonical) return false;
  try {
    return new URL(page.canonical).hostname.toLowerCase() === config.siteHost.toLowerCase();
  } catch {
    return false;
  }
}

/**
 * Compares the crawled page set against the sitemap to find sitemap
 * coverage gaps, distinguishing pages that are genuinely missing from the
 * sitemap (indexable, self-canonical) from ones that just happen to be
 * noindex/non-indexable — the latter is informational, not an SEO issue.
 * Also flags sitemap pages with zero inbound internal links, but only
 * when they're indexable (an intentionally noindexed utility page in the
 * sitemap being "orphaned" isn't a real finding).
 */
export function findCoverageIssues(pages: PageResult[], sitemapUrls: Set<string>): CoverageResult {
  const issuesByUrl = new Map<string, Issue[]>();

  function addIssue(page: PageResult, issue: Issue): void {
    const list = issuesByUrl.get(page.url) ?? [];
    list.push(issue);
    issuesByUrl.set(page.url, list);
  }

  // Every internal link target seen anywhere in the crawl, used to decide
  // whether a sitemap page has any inbound internal links at all.
  const linkedTargets = new Set<string>();
  for (const page of pages) {
    const sourceKey = normalizeUrl(page.finalUrl) ?? page.finalUrl;
    for (const link of page.internalLinks) {
      const key = normalizeUrl(link) ?? link;
      if (key === sourceKey) continue; // never count a page linking to itself
      linkedTargets.add(key);
    }
  }

  let discoveredNotInSitemapCount = 0;
  let indexableMissingFromSitemapCount = 0;
  let nonIndexableMissingFromSitemapCount = 0;
  let orphanedSitemapPageCount = 0;

  for (const page of pages) {
    const key = normalizeUrl(page.finalUrl) ?? page.finalUrl;
    const inSitemap = sitemapUrls.has(key) || sitemapUrls.has(normalizeUrl(page.url) ?? page.url);

    if (page.outcome === "ok" && page.sources.discovered && !inSitemap) {
      discoveredNotInSitemapCount += 1;

      if (page.isIndexable && hasSelfCanonical(page)) {
        indexableMissingFromSitemapCount += 1;
        addIssue(page, {
          issueType: "indexable_page_missing_from_sitemap",
          severity: "medium",
          message: "Indexable internally linked page is missing from the XML sitemap.",
          recommendation:
            "Add this canonical URL to the sitemap if the page is intended to appear in search results.",
          url: page.url,
        });
      } else {
        nonIndexableMissingFromSitemapCount += 1;
      }
    }

    if (page.sources.sitemap && page.outcome === "ok" && page.isIndexable) {
      const hasInboundLink = linkedTargets.has(key);
      if (!hasInboundLink) {
        orphanedSitemapPageCount += 1;
        addIssue(page, {
          issueType: "orphaned_sitemap_page",
          severity: "medium",
          message: "Sitemap page has no internal links pointing to it from other crawled pages.",
          recommendation:
            "Add relevant internal links to this page if it should be discoverable through normal site navigation.",
          url: page.url,
        });
      }
    }
  }

  return {
    issuesByUrl,
    discoveredNotInSitemapCount,
    indexableMissingFromSitemapCount,
    nonIndexableMissingFromSitemapCount,
    orphanedSitemapPageCount,
  };
}
