import type { PageType } from "../types/seo.js";

export interface PageTypeContext {
  /** URL path, e.g. "/episodes/some-slug" (no trailing slash except root). */
  path: string;
  /** Path split into non-empty segments, e.g. ["episodes", "some-slug"]. */
  segments: string[];
}

export interface PageTypeRule {
  pageType: PageType;
  test: (ctx: PageTypeContext) => boolean;
}

/**
 * Ordered, path-based classification rules. Evaluated top to bottom; the
 * first match wins. This default ruleset matches thesickestpodcast.com's
 * URL structure, but the shape (an ordered list of {pageType, test})
 * is intentionally generic so a different site can supply its own rules
 * without touching classifyPage.ts.
 */
export const defaultPageTypeRules: PageTypeRule[] = [
  {
    pageType: "homepage",
    test: (ctx) => ctx.path === "/",
  },
  {
    pageType: "episodes_index",
    test: (ctx) => ctx.segments.length === 1 && ctx.segments[0] === "episodes",
  },
  {
    pageType: "episode",
    test: (ctx) => ctx.segments.length >= 2 && ctx.segments[0] === "episodes",
  },
  {
    pageType: "booking",
    test: (ctx) => ctx.segments.length === 1 && ctx.segments[0] === "booking",
  },
  {
    pageType: "service",
    test: (ctx) => ctx.segments.length >= 2 && ctx.segments[0] === "booking",
  },
];
