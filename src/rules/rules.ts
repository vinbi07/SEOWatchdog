import type { Issue, PageResult } from "../types/seo.js";
import { config } from "../config/config.js";
import { thresholds } from "./thresholds.js";
import { findAnchorIssues } from "./anchorRules.js";
import { findHeadingIssues } from "./headingRules.js";
import { findHreflangIssues } from "./hreflangRules.js";

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

    // Rendered-width estimate is the primary heuristic for "too long" — a
    // 62-character title with narrow glyphs can still fit a SERP, while a
    // shorter title full of wide capitals may not. Character count alone
    // (the old `title_too_long` rule) is too crude and is intentionally not
    // used for this check anymore; see thresholds.title.maxPixelWidth.
    if (page.titlePixelWidthEstimate !== null && page.titlePixelWidthEstimate > thresholds.title.maxPixelWidth) {
      issues.push(
        makeIssue(page, {
          issueType: "title_pixel_width_high",
          severity: "low",
          message: `Estimated title width (~${page.titlePixelWidthEstimate}px) may exceed typical desktop search result display width (~${thresholds.title.maxPixelWidth}px).`,
          recommendation: "Shorten the title or use narrower wording so it's less likely to be truncated in search results.",
          value: { pixelWidthEstimate: page.titlePixelWidthEstimate, titleLength: page.titleLength },
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
  } else if (
    page.metaDescriptionPixelWidthEstimate !== null &&
    page.metaDescriptionPixelWidthEstimate > thresholds.metaDescription.maxPixelWidth
  ) {
    issues.push(
      makeIssue(page, {
        issueType: "meta_description_pixel_width_high",
        severity: "low",
        message: `Estimated meta description width (~${page.metaDescriptionPixelWidthEstimate}px) may exceed typical desktop search result display width (~${thresholds.metaDescription.maxPixelWidth}px).`,
        recommendation: "Shorten the meta description so it's less likely to be truncated in search results.",
        value: { pixelWidthEstimate: page.metaDescriptionPixelWidthEstimate, length: page.metaDescriptionLength },
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

  // --- Heading quality (Step 2.6) ----------------------------------------
  for (const issue of findHeadingIssues(page.headings, page.wordCount, page.url)) {
    issues.push(issue);
  }

  // --- Anchor quality (Step 2.6) ------------------------------------------
  for (const issue of findAnchorIssues(page.anchorMetrics, page.url)) {
    issues.push(issue);
  }

  // --- Duplicate visible content (Step 2.6) --------------------------------
  if (page.duplicateContentSamples.length > 0) {
    issues.push(
      makeIssue(page, {
        issueType: "duplicate_visible_content",
        severity: page.duplicateContentSamples.length >= thresholds.duplicateContent.mediumSeverityGroupCount ? "medium" : "low",
        message: `Page repeats ${page.duplicateContentSamples.length} visible text block(s) (e.g. paragraph, CTA, or description copy) more than once.`,
        recommendation: "Check whether repeated content blocks are intentional (e.g. a shared component) or accidental duplication.",
        value: page.duplicateContentSamples,
      })
    );
  }

  // --- HTML document hygiene (Step 2.6) ------------------------------------
  if (!page.charset) {
    issues.push(
      makeIssue(page, {
        issueType: "missing_charset",
        severity: "low",
        message: "Page does not declare a character encoding.",
        recommendation: 'Add a <meta charset="UTF-8"> tag (or equivalent) near the top of <head>.',
      })
    );
  }
  if (!page.hasHtml5Doctype) {
    issues.push(
      makeIssue(page, {
        issueType: "missing_doctype",
        severity: "low",
        message: "Page does not start with an HTML5 doctype declaration.",
        recommendation: "Add <!DOCTYPE html> as the first line of the document.",
      })
    );
  }

  // --- HTTPS / mixed content (Step 2.6) ------------------------------------
  if (page.mixedContentCount > 0) {
    issues.push(
      makeIssue(page, {
        issueType: "mixed_content",
        severity: "high",
        message: `${page.mixedContentCount} resource(s) are loaded over plain HTTP on this HTTPS page.`,
        recommendation: "Update these resource URLs to HTTPS (or protocol-relative/relative URLs) to avoid mixed-content warnings and blocked resources.",
        value: page.mixedContentSamples,
      })
    );
  }

  // --- Server compression (Step 2.6) ---------------------------------------
  const isUncompressed = !page.compressionEncoding || page.compressionEncoding === "identity" || page.compressionEncoding === "none";
  if (isUncompressed && page.htmlSizeBytes >= thresholds.htmlResponse.minSizeForCompressionCheckBytes) {
    issues.push(
      makeIssue(page, {
        issueType: "html_response_uncompressed",
        severity: "low",
        message: `HTML response (${Math.round(page.htmlSizeBytes / 1024)} KB) was served without compression (content-encoding: ${page.compressionEncoding ?? "none"}).`,
        recommendation: "Enable gzip or brotli compression on the server for HTML responses.",
        value: { htmlSizeBytes: page.htmlSizeBytes, compressionEncoding: page.compressionEncoding },
      })
    );
  }

  // --- Response header hygiene (Step 2.6) -----------------------------------
  if (page.serverHeaders.xPoweredBy) {
    issues.push(
      makeIssue(page, {
        issueType: "x_powered_by_exposed",
        severity: "low",
        message: `Server exposes an X-Powered-By header ("${page.serverHeaders.xPoweredBy}").`,
        recommendation: "Consider removing the X-Powered-By header as routine operational/security hygiene (this does not directly affect rankings).",
        value: page.serverHeaders.xPoweredBy,
      })
    );
  }

  // --- Hreflang / alternate links (Step 2.6) ---------------------------------
  for (const issue of findHreflangIssues(page.alternateLinks, page.url)) {
    issues.push(issue);
  }

  return issues;
}
