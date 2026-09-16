import type { PageType } from "../types/seo.js";

/**
 * Centralized, configurable thresholds for SEO heuristics.
 * These are internal monitoring guidelines, not absolute Google ranking rules.
 */
export const thresholds = {
  title: {
    minLength: 20,
    maxLength: 60,
  },
  metaDescription: {
    maxLength: 160,
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
} as const;
