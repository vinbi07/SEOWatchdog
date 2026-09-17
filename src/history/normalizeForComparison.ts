/**
 * Normalization helpers used only for deciding whether two crawls' values
 * are "meaningfully different". These never mutate persisted data — they
 * exist purely so comparison logic ignores noise like whitespace-only edits,
 * trailing slashes, tracking parameters, or JSON/array ordering.
 */
import { normalizeUrl } from "../utils/urls.js";

/** Collapses internal whitespace and trims, so reformatted-but-identical text doesn't register as a change. */
export function normalizeText(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  return value.replace(/\s+/g, " ").trim();
}

export function textChanged(previous: string | null | undefined, current: string | null | undefined): boolean {
  return normalizeText(previous) !== normalizeText(current);
}

/** Reuses the crawler's own URL normalization (strips tracking params, trailing slash, etc.) for stable comparison. */
export function normalizeUrlForComparison(url: string): string {
  return normalizeUrl(url) ?? url;
}

export function urlChanged(previous: string | null | undefined, current: string | null | undefined): boolean {
  const a = previous ? normalizeUrlForComparison(previous) : null;
  const b = current ? normalizeUrlForComparison(current) : null;
  return a !== b;
}

/** Sorted, deduped list of structured data @type values — order and duplicates never count as a change. */
export function normalizeStructuredDataTypes(types: string[]): string[] {
  return Array.from(new Set(types)).sort();
}

export function structuredDataTypesChanged(previous: string[], current: string[]): boolean {
  const a = normalizeStructuredDataTypes(previous);
  const b = normalizeStructuredDataTypes(current);
  if (a.length !== b.length) return true;
  return a.some((value, index) => value !== b[index]);
}

const WORD_COUNT_ABSOLUTE_THRESHOLD = 100;
const WORD_COUNT_PERCENT_THRESHOLD = 0.3;

/** Word count only "changes" for reporting purposes past a threshold, to avoid flooding on trivial edits. */
export function wordCountChangedSignificantly(previous: number, current: number): boolean {
  const absoluteDelta = Math.abs(current - previous);
  if (absoluteDelta >= WORD_COUNT_ABSOLUTE_THRESHOLD) return true;
  if (previous === 0) return current > 0 && absoluteDelta >= WORD_COUNT_ABSOLUTE_THRESHOLD;
  return absoluteDelta / previous >= WORD_COUNT_PERCENT_THRESHOLD;
}

const INTERNAL_LINK_COUNT_NOISE_THRESHOLD = 5;

/**
 * Internal inbound link count only "changes" for reporting when the page
 * crosses into/out of zero (possible orphaning) or moves by a meaningful
 * amount — a single link added/removed elsewhere on the site shouldn't spam
 * every page that links to it.
 */
export function internalInboundLinkCountChangedSignificantly(previous: number, current: number): boolean {
  if (previous > 0 && current === 0) return true;
  if (previous === 0 && current > 0) return true;
  return Math.abs(current - previous) >= INTERNAL_LINK_COUNT_NOISE_THRESHOLD;
}
