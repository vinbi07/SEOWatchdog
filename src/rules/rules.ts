import type { Issue, PageResult } from "../types/seo.js";
import { config } from "../config/config.js";
import { thresholds } from "./thresholds.js";

function makeIssue(page: PageResult, partial: Omit<Issue, "url">): Issue {
  return { ...partial, url: page.url };
}

/**
 * Applies every single-page (non-duplicate) SEO rule to one crawled page.
 * Duplicate-title / duplicate-description / canonical rules live in
 * duplicateRules.ts since they require the full crawl set.
 */
export function applyPageRules(page: PageResult): Issue[] {
  const issues: Issue[] = [];

  // --- Crawlability -------------------------------------------------
  if (page.outcome === "network_error") {
    issues.push(
      makeIssue(page, {
        issueType: "crawl_failure",
        severity: "critical",
        message: `Page could not be crawled: ${page.errorMessage ?? "unknown network error"}`,
        recommendation: "Investigate connectivity, DNS, TLS, or server-side errors preventing this page from loading.",
        value: page.errorMessage,
      })
    );
    return issues; // No further analysis possible without a response.
  }

  if (page.status !== null && page.status >= 500) {
    issues.push(
      makeIssue(page, {
        issueType: "server_error",
        severity: "critical",
        message: `Page returned a server error (HTTP ${page.status}).`,
        recommendation: "Fix the server-side error causing this page to fail.",
        value: page.status,
      })
    );
    return issues;
  }

  if (page.status !== null && page.status >= 400) {
    issues.push(
      makeIssue(page, {
        issueType: "client_error",
        severity: "high",
        message: `Page returned a client error (HTTP ${page.status}).`,
        recommendation: "Fix the broken link/route, or remove this URL from the sitemap if it no longer exists.",
        value: page.status,
      })
    );
    return issues;
  }

  if (page.redirectCount > 0 && page.sources.sitemap) {
    issues.push(
      makeIssue(page, {
        issueType: "sitemap_url_redirect",
        severity: "high",
        message: `Sitemap URL redirects (${page.redirectCount} hop(s)) to ${page.finalUrl}.`,
        recommendation: "Update the sitemap to reference the final destination URL directly.",
        value: page.finalUrl,
      })
    );
  }

  // A noindex page is only a problem when the sitemap itself claims it
  // should be indexed. A noindex page reached only via link discovery is
  // very likely an intentional utility/thank-you/etc. page — not a bug
  // (see analyzeIndexingState.ts for that more nuanced handling).
  if (page.noindex && page.sources.sitemap) {
    issues.push(
      makeIssue(page, {
        issueType: "sitemap_url_noindex",
        severity: "high",
        message: "URL is included in the sitemap but marked noindex.",
        recommendation: "Remove this URL from the sitemap, or remove the noindex directive if it should be indexed.",
        value: page.robotsMeta.raw,
      })
    );
  }

  // --- Titles ---------------------------------------------------------
  if (!page.title) {
    issues.push(
      makeIssue(page, {
        issueType: "missing_title",
        severity: "high",
        message: "Page is missing a <title> tag.",
        recommendation: "Add a unique, descriptive title tag between 20 and 60 characters.",
      })
    );
  } else {
    const titleSeverity = thresholds.titleLengthMediumSeverityPageTypes.includes(page.pageType) ? "medium" : "low";

    if (page.titleLength > thresholds.title.maxLength) {
      issues.push(
        makeIssue(page, {
          issueType: "title_too_long",
          severity: titleSeverity,
          message: `Title is ${page.titleLength} characters and may be truncated in some search result layouts.`,
          recommendation: `Consider tightening the title to around ${thresholds.title.maxLength} characters or fewer.`,
          value: page.titleLength,
        })
      );
    }
    if (page.titleLength < thresholds.title.minLength) {
      issues.push(
        makeIssue(page, {
          issueType: "title_too_short",
          severity: titleSeverity,
          message: "Page title is very short and may not provide enough context to search engines or users.",
          recommendation: `Consider expanding the title to better describe the page's content (around ${thresholds.title.minLength}+ characters).`,
          value: page.titleLength,
        })
      );
    }
  }

  // --- Canonical --------------------------------------------------------
  if (!page.canonical) {
    issues.push(
      makeIssue(page, {
        issueType: "missing_canonical",
        severity: "high",
        message: "Page is missing a canonical link tag.",
        recommendation: "Add a self-referencing (or otherwise correct) canonical tag.",
      })
    );
  } else {
    try {
      const canonicalHost = new URL(page.canonical).hostname.toLowerCase();
      if (canonicalHost !== config.siteHost.toLowerCase()) {
        issues.push(
          makeIssue(page, {
            issueType: "canonical_external_domain",
            severity: "high",
            message: `Canonical URL points to an unexpected external domain: ${canonicalHost}.`,
            recommendation: "Verify this is intentional; otherwise point the canonical back to this domain.",
            value: page.canonical,
          })
        );
      }
    } catch {
      issues.push(
        makeIssue(page, {
          issueType: "canonical_external_domain",
          severity: "high",
          message: `Canonical URL is not a valid absolute URL: ${page.canonical}`,
          recommendation: "Use a valid absolute URL for the canonical tag.",
          value: page.canonical,
        })
      );
    }
  }

  // --- Meta description ---------------------------------------------
  if (!page.metaDescription) {
    issues.push(
      makeIssue(page, {
        issueType: "missing_meta_description",
        severity: "medium",
        message: "Page is missing a meta description.",
        recommendation: "Add a unique meta description under 160 characters summarizing the page.",
      })
    );
  } else if (page.metaDescriptionLength > thresholds.metaDescription.maxLength) {
    issues.push(
      makeIssue(page, {
        issueType: "meta_description_too_long",
        severity: "medium",
        message: `Meta description is ${page.metaDescriptionLength} characters, longer than the recommended ${thresholds.metaDescription.maxLength}.`,
        recommendation: "Shorten the meta description so it is not truncated in search results.",
        value: page.metaDescriptionLength,
      })
    );
  }

  // --- Headings -----------------------------------------------------
  if (page.h1Count === 0) {
    issues.push(
      makeIssue(page, {
        issueType: "missing_h1",
        severity: "medium",
        message: "Page has no H1 heading.",
        recommendation: "Add a single, descriptive H1 heading to the page.",
      })
    );
  } else if (page.h1Count > 1) {
    issues.push(
      makeIssue(page, {
        issueType: "multiple_h1",
        severity: "medium",
        message: `Page has ${page.h1Count} H1 headings.`,
        recommendation: "Use a single H1 heading per page for clear topical structure.",
        value: page.h1Count,
      })
    );
  }

  // --- Links ----------------------------------------------------------
  if (page.brokenInternalLinks.length > 0) {
    issues.push(
      makeIssue(page, {
        issueType: "broken_internal_links",
        severity: "medium",
        message: `Page contains ${page.brokenInternalLinks.length} broken internal link(s).`,
        recommendation: "Update or remove links pointing to pages that return errors.",
        value: page.brokenInternalLinks,
      })
    );
  }

  // --- Images -----------------------------------------------------------
  if (page.images.missingAlt > 0) {
    issues.push(
      makeIssue(page, {
        issueType: "images_missing_alt",
        severity: "low",
        message: `${page.images.missingAlt} of ${page.images.total} image(s) are missing alt attributes.`,
        recommendation: "Add descriptive alt text to all meaningful images for accessibility and image SEO.",
        value: page.images.missingAlt,
      })
    );
  }

  // --- Social metadata --------------------------------------------------
  if (!page.openGraph.title && !page.openGraph.description && !page.openGraph.image) {
    issues.push(
      makeIssue(page, {
        issueType: "missing_open_graph",
        severity: "low",
        message: "Page is missing Open Graph metadata.",
        recommendation: "Add og:title, og:description, and og:image tags for better social sharing previews.",
      })
    );
  }

  if (!page.twitter.card && !page.twitter.title && !page.twitter.description && !page.twitter.image) {
    issues.push(
      makeIssue(page, {
        issueType: "missing_twitter",
        severity: "low",
        message: "Page is missing Twitter card metadata.",
        recommendation: "Add twitter:card and related meta tags for better previews on X/Twitter.",
      })
    );
  }

  // --- Misc technical -----------------------------------------------
  if (!page.lang) {
    issues.push(
      makeIssue(page, {
        issueType: "missing_lang",
        severity: "low",
        message: "Page is missing an html lang attribute.",
        recommendation: "Add a lang attribute to the <html> element (e.g. lang=\"en\").",
      })
    );
  }

  if (!page.hasFavicon) {
    issues.push(
      makeIssue(page, {
        issueType: "missing_favicon",
        severity: "low",
        message: "Page is missing a favicon link.",
        recommendation: "Add a <link rel=\"icon\"> tag pointing to a favicon.",
      })
    );
  }

  const wordCountThreshold = thresholds.wordCount.byPageType[page.pageType];
  if (wordCountThreshold !== null && page.wordCount < wordCountThreshold) {
    issues.push(
      makeIssue(page, {
        issueType: "low_word_count",
        severity: "low",
        message: `Low content for ${page.pageType} page (${page.wordCount} words, expected at least ${wordCountThreshold}).`,
        recommendation: "Consider whether this page has enough unique content to be useful and indexable.",
        value: page.wordCount,
      })
    );
  }

  // --- Page-type specific rules -----------------------------------------
  if (page.pageType === "episode") {
    const hasPodcastEpisodeSchema = page.structuredData.some((entry) => entry.type === "PodcastEpisode");
    if (!hasPodcastEpisodeSchema) {
      issues.push(
        makeIssue(page, {
          issueType: "missing_podcast_episode_schema",
          severity: "medium",
          message: "Episode page is missing PodcastEpisode structured data.",
          recommendation: "Add PodcastEpisode structured data describing the episode.",
        })
      );
    }
  }

  return issues;
}
