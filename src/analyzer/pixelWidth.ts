/**
 * Deterministic approximation of rendered text width in a typical desktop
 * search-result font (~16px, Arial/Helvetica-like proportions). This is a
 * small glyph-width lookup table, NOT a browser rendering — it exists so
 * title/meta-description warnings track something closer to "will this get
 * truncated in a SERP" than a raw character count, without requiring any
 * actual rendering. Never present this as an exact Google limit.
 */

const NARROW = ["i", "j", "l", "I", ".", ",", "'", "!", "|", ":", ";", "’", "‘"];
const SEMI_NARROW = ["f", "t", "r", "(", ")", "[", "]", "\"", "-", "/", "\\"];
const WIDE = ["M", "W", "m", "w", "@", "%"];
const UPPERCASE_DEFAULT = 10.5;
const LOWERCASE_DEFAULT = 8;
const DIGIT_WIDTH = 9;
const SPACE_WIDTH = 5;
const FALLBACK_WIDTH = 9;

const GLYPH_WIDTHS: Record<string, number> = {};
for (const ch of NARROW) GLYPH_WIDTHS[ch] = 4.5;
for (const ch of SEMI_NARROW) GLYPH_WIDTHS[ch] = 6;
for (const ch of WIDE) GLYPH_WIDTHS[ch] = 14;
GLYPH_WIDTHS[" "] = SPACE_WIDTH;

function widthForChar(ch: string): number {
  if (ch in GLYPH_WIDTHS) return GLYPH_WIDTHS[ch]!;
  if (ch >= "0" && ch <= "9") return DIGIT_WIDTH;
  if (ch >= "A" && ch <= "Z") return UPPERCASE_DEFAULT;
  if (ch >= "a" && ch <= "z") return LOWERCASE_DEFAULT;
  return FALLBACK_WIDTH;
}

/** Estimated rendered pixel width of `text` at typical SERP font size. Returns 0 for empty/null input. */
export function estimatePixelWidth(text: string | null | undefined): number {
  if (!text) return 0;
  let total = 0;
  for (const ch of text) {
    total += widthForChar(ch);
  }
  return Math.round(total);
}
