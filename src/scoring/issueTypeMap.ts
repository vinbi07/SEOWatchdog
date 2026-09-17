import type { ScoreCategory } from "./types.js";

/**
 * Maps every issueType currently produced by the rules engine to a scoring
 * category and a multiplier. The multiplier is applied on top of
 * SEVERITY_BASE_PENALTY[issue.severity] (see config.ts) — severity always
 * comes from the emitted Issue.severity, never from this table. That matters
 * for issue types whose severity is decided dynamically by the rule itself
 * (title_too_short, duplicate_visible_content, duplicate_heading_text) —
 * this table only adjusts how much that severity's base penalty counts for,
 * it never overrides it.
 *
 * host_canonicalization_issue is pushed only onto the homepage's issues[]
 * (see src/index.ts), so it structurally occurs at most once per crawl
 * already — no special-casing is needed here, but if that emission site
 * ever changes, revisit the diminishing-returns assumption in penalties.ts.
 *
 * title_too_long / meta_description_too_long are stale dashboard labels that
 * nothing in the rules engine produces anymore (superseded by the
 * pixel-width checks) — intentionally absent from this table.
 */
export const ISSUE_TYPE_CATEGORY_MAP: Record<string, { category: ScoreCategory; multiplier: number }> = {
  // Technical SEO
  crawl_failure: { category: "technical", multiplier: 1.5 },
  server_error: { category: "technical", multiplier: 1.5 },
  // 0 = excluded from scoring entirely (still surfaced as an issue in the
  // dashboard/issue list — this only zeroes its penalty contribution).
  // Some sites carry unavoidable 4xx links (e.g. expired episode pages);
  // set back to e.g. 1.2 to have client errors count against the score again.
  client_error: { category: "technical", multiplier: 0 },
  host_canonicalization_issue: { category: "technical", multiplier: 1.2 },
  mixed_content: { category: "technical", multiplier: 1.2 },
  missing_charset: { category: "technical", multiplier: 0.5 },
  missing_doctype: { category: "technical", multiplier: 0.5 },
  x_powered_by_exposed: { category: "technical", multiplier: 0.3 },
  missing_favicon: { category: "technical", multiplier: 0.3 },

  // On-Page SEO
  missing_title: { category: "onPage", multiplier: 1.2 },
  title_pixel_width_high: { category: "onPage", multiplier: 0.5 },
  title_too_short: { category: "onPage", multiplier: 1.0 },
  missing_canonical: { category: "onPage", multiplier: 1.2 },
  canonical_external_domain: { category: "onPage", multiplier: 1.3 },
  missing_meta_description: { category: "onPage", multiplier: 1.0 },
  meta_description_pixel_width_high: { category: "onPage", multiplier: 0.5 },
  missing_h1: { category: "onPage", multiplier: 1.0 },
  multiple_h1: { category: "onPage", multiplier: 0.8 },
  missing_lang: { category: "onPage", multiplier: 0.5 },
  missing_open_graph: { category: "onPage", multiplier: 0.4 },
  missing_twitter: { category: "onPage", multiplier: 0.3 },
  duplicate_title: { category: "onPage", multiplier: 1.2 },
  duplicate_meta_description: { category: "onPage", multiplier: 1.0 },
  images_missing_alt: { category: "onPage", multiplier: 0.4 },

  // Content Quality
  low_word_count: { category: "content", multiplier: 0.6 },
  duplicate_visible_content: { category: "content", multiplier: 1.0 },
  missing_podcast_episode_schema: { category: "content", multiplier: 0.9 },
  duplicate_heading_text: { category: "content", multiplier: 0.7 },
  heading_hierarchy_skip: { category: "content", multiplier: 0.4 },
  excessive_headings: { category: "content", multiplier: 0.3 },

  // Internal Linking
  broken_internal_links: { category: "internalLinks", multiplier: 1.2 },
  empty_internal_anchor: { category: "internalLinks", multiplier: 0.8 },
  generic_anchor_text: { category: "internalLinks", multiplier: 0.25 },
  ambiguous_repeated_anchor_text: { category: "internalLinks", multiplier: 0.4 },

  // Indexing & Crawlability
  sitemap_url_redirect: { category: "indexing", multiplier: 1.0 },
  sitemap_url_noindex: { category: "indexing", multiplier: 1.1 },
  indexable_page_missing_from_sitemap: { category: "indexing", multiplier: 1.0 },
  orphaned_sitemap_page: { category: "indexing", multiplier: 0.7 },
  unexpected_noindex: { category: "indexing", multiplier: 1.5 },
  noindex_requires_review: { category: "indexing", multiplier: 0.6 },
  hreflang_missing_href: { category: "indexing", multiplier: 0.8 },
  invalid_hreflang: { category: "indexing", multiplier: 0.4 },
  hreflang_duplicate_language: { category: "indexing", multiplier: 0.8 },

  // Performance / Server
  html_response_uncompressed: { category: "performance", multiplier: 0.5 },
};
