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
  wordCount: {
    low: 300,
  },
} as const;
