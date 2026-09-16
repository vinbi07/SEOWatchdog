import type { PageType, PublicationState } from "../types/seo.js";

export interface IndexingRule {
  /** publicationState values for which a noindex page of this pageType is expected/fine. */
  allowNoindexWhenPublicationState: PublicationState[];
  /** publicationState values for which a noindex page of this pageType is a real problem. */
  requireIndexableWhenPublicationState: PublicationState[];
}

/**
 * Site-specific indexing expectations, by page type. Page types with no
 * entry here fall back to a lenient default (noindex is assumed
 * intentional) in analyzeIndexingState.ts — this map only needs entries
 * for page types where we can reason about *why* noindex might be
 * temporary, like episodes that haven't been released yet.
 *
 * This is the kind of thing a future multi-site config would move to
 * per-site JSON/config rather than a hardcoded map.
 */
export const indexingRules: Partial<Record<PageType, IndexingRule>> = {
  episode: {
    // "unknown" is intentionally NOT in this list: when we can't tell
    // whether an episode has been released, we flag it for a low-severity
    // manual review (noindex_review) rather than assuming either way.
    allowNoindexWhenPublicationState: ["scheduled", "draft"],
    requireIndexableWhenPublicationState: ["published"],
  },
};
