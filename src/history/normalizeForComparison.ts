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

const LINK_COUNT_ABSOLUTE_THRESHOLD = 10;
const LINK_COUNT_PERCENT_THRESHOLD = 0.4;

/**
 * General-purpose internal/external outbound link count comparison (Step
 * 2.6): a page's link count only "changes" for reporting when it moves by
 * >=10 absolute or >=40% relative, or crosses into/out of zero — a couple
 * of links added/removed shouldn't spam the timeline. `previous`/`current`
 * may be null (field didn't exist on older snapshots); a null on either
 * side is never treated as a change.
 */
export function linkCountChangedSignificantly(previous: number | null, current: number | null): boolean {
  if (previous === null || current === null) return false;
  if (previous > 0 && current === 0) return true;
  if (previous === 0 && current > 0) return true;
  const absoluteDelta = Math.abs(current - previous);
  if (absoluteDelta >= LINK_COUNT_ABSOLUTE_THRESHOLD) return true;
  if (previous === 0) return false;
  return absoluteDelta / previous >= LINK_COUNT_PERCENT_THRESHOLD;
}

const HTML_SIZE_ABSOLUTE_THRESHOLD_BYTES = 100 * 1024;
const HTML_SIZE_PERCENT_THRESHOLD = 0.5;

/** HTML payload size only "changes" for reporting past >=100KB absolute or >=50% relative (Step 2.6). */
export function htmlSizeChangedSignificantly(previous: number | null, current: number | null): boolean {
  if (previous === null || current === null) return false;
  const absoluteDelta = Math.abs(current - previous);
  if (absoluteDelta >= HTML_SIZE_ABSOLUTE_THRESHOLD_BYTES) return true;
  if (previous === 0) return false;
  return absoluteDelta / previous >= HTML_SIZE_PERCENT_THRESHOLD;
}

const RESPONSE_TIME_ABSOLUTE_THRESHOLD_MS = 1000;
const RESPONSE_TIME_PERCENT_THRESHOLD = 0.5;

/**
 * Response time is noisy by nature (network variability), so this requires
 * BOTH a large absolute change (>=1s) AND a large relative one (>=50%)
 * before it's worth surfacing — a normal fluctuation should never appear
 * in the timeline.
 */
export function responseTimeChangedSignificantly(previous: number | null, current: number | null): boolean {
  if (previous === null || current === null) return false;
  const absoluteDelta = Math.abs(current - previous);
  if (absoluteDelta < RESPONSE_TIME_ABSOLUTE_THRESHOLD_MS) return false;
  if (previous === 0) return false;
  return absoluteDelta / previous >= RESPONSE_TIME_PERCENT_THRESHOLD;
}
