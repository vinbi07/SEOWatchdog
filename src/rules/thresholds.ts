import type { PageType } from "../types/seo.js";

/**
 * Centralized, configurable thresholds for SEO heuristics.
 * These are internal monitoring guidelines, not absolute Google ranking rules.
 */
export const thresholds = {
  title: {
    minLength: 20,
    maxLength: 60,
    /** Deterministic character-width approximation, not an exact Google SERP cutoff. See analyzer/pixelWidth.ts. */
    maxPixelWidth: 600,
  },
  metaDescription: {
    maxLength: 160,
    maxPixelWidth: 950,
  },
  /**
   * Minimum expected word count, by page type. `null` means "don't warn
   * about low content for this page type" (e.g. a homepage is often
   * intentionally light on body copy).
   */
  wordCount: {
    byPageType: {
      homepage: null,
      episode: 75,
      episodes_index: 100,
      booking: 100,
      service: 150,
      generic: 150,
      unknown: 150,
    } satisfies Record<PageType, number | null>,
  },
  /**
   * Page types whose titles/H1s materially affect discoverability enough
   * that a title-length issue is worth "medium" rather than "low" severity.
   */
  titleLengthMediumSeverityPageTypes: ["homepage", "episode", "episodes_index"] as PageType[],

  headings: {
    /** A duplicate-text group with more repeats than this looks like a repeated card/grid component, not a real issue. */
    maxDuplicateOccurrencesToFlag: 3,
    /** Heading/word ratio above which a page is considered to have excessive headings relative to its content. */
    excessiveHeadingRatio: 0.12,
    /** Below this many headings, ratio noise isn't worth flagging even if the ratio looks high. */
    minHeadingCountForRatioCheck: 8,
    /** Below this many words, content is too thin to judge heading density at all. */
    minWordCountForRatioCheck: 30,
  },

  anchors: {
    genericTexts: ["click here", "read more", "learn more", "here", "more", "this link", "link", "click"],
    /** Below this many characters, anchor text isn't meaningful for the empty-anchor check either way. */
    minMeaningfulTextLength: 2,
    /** Same normalized text pointing at this many (or more) distinct internal URLs is ambiguous, not just reused nav copy. */
    minAmbiguousDestinations: 3,
  },

  duplicateContent: {
    minBlockLength: 45,
    maxSamplesStored: 5,
    sampleTruncateLength: 160,
    /** This many or more duplicate blocks bumps the issue from low to medium severity. */
    mediumSeverityGroupCount: 3,
  },

  htmlResponse: {
    /** Below this size, compression overhead isn't worth flagging either way. */
    minSizeForCompressionCheckBytes: 5 * 1024,
  },

  mixedContent: {
    maxSamplesStored: 5,
  },
} as const;
