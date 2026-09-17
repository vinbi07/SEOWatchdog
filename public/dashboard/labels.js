// Human-readable labels for raw DB identifiers. Mirrors src/dashboard/labels.ts
// (kept in sync by hand — this file has no build step / bundler to share
// code with the TS server, see README "Dashboard" section).

const EVENT_TYPE_LABELS = {
  issue_new: "New Issue",
  issue_ongoing: "Ongoing Issue",
  issue_resolved: "Resolved",
  severity_changed: "Severity Changed",
  page_new: "New Page",
  page_removed: "Missing Page",
  field_changed: "Metadata Changed",
  indexability_changed: "Indexability Changed",
  indexing_state_changed: "Indexing Changed",
  publication_state_changed: "Publication State Changed",
  page_added_to_sitemap: "Added to Sitemap",
  page_removed_from_sitemap: "Removed from Sitemap",
  page_became_discovered: "Became Discovered",
  page_no_longer_discovered: "No Longer Discovered",
  http_status_changed: "HTTP Status Changed",
  canonical_changed: "Canonical Changed",
};

const EVENT_CATEGORIES = {
  new_issues: ["issue_new"],
  resolved: ["issue_resolved"],
  page_changes: ["page_new", "page_removed", "field_changed", "http_status_changed"],
  indexing: ["indexability_changed", "indexing_state_changed", "publication_state_changed"],
  sitemap: ["page_added_to_sitemap", "page_removed_from_sitemap", "page_became_discovered", "page_no_longer_discovered"],
  metadata: ["canonical_changed", "severity_changed"],
};

const ISSUE_TYPE_LABELS = {
  crawl_failure: "Crawl Failure",
  server_error: "Server Error",
  client_error: "Client Error",
  sitemap_url_redirect: "Sitemap URL Redirects",
  sitemap_url_noindex: "Sitemap URL Is Noindex",
  missing_title: "Missing Title",
  title_too_long: "Title May Be Too Long",
  title_too_short: "Title Too Short",
  missing_canonical: "Missing Canonical",
  canonical_external_domain: "Canonical Points Off-Site",
  missing_meta_description: "Missing Meta Description",
  meta_description_too_long: "Meta Description Too Long",
  missing_h1: "Missing H1",
  multiple_h1: "Multiple H1 Tags",
  broken_internal_links: "Broken Internal Links",
  images_missing_alt: "Images Missing Alt Text",
  missing_open_graph: "Missing Open Graph Tags",
  missing_twitter: "Missing Twitter Card Tags",
  missing_lang: "Missing Language Attribute",
  missing_favicon: "Missing Favicon",
  low_word_count: "Low Content",
  missing_podcast_episode_schema: "Missing Podcast Episode Schema",
  duplicate_title: "Duplicate Title",
  duplicate_meta_description: "Duplicate Meta Description",
  indexable_page_missing_from_sitemap: "Missing From Sitemap",
  orphaned_sitemap_page: "Orphaned Sitemap Page",
  unexpected_noindex: "Unexpected Noindex",
  noindex_requires_review: "Noindex Needs Review",
};

const PAGE_TYPE_LABELS = {
  homepage: "Homepage",
  episode: "Episode",
  episodes_index: "Episodes Index",
  booking: "Booking",
  service: "Service",
  generic: "Generic",
  unknown: "Unknown",
};

const INDEXING_STATE_LABELS = {
  indexable: "Indexable",
  noindex_expected: "Noindex (Expected)",
  noindex_review: "Noindex (Needs Review)",
  noindex_unexpected: "Noindex (Unexpected)",
};

function labelFor(map, key) {
  if (!key) return "—";
  return map[key] || key;
}
