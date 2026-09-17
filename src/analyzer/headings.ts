import type { CheerioAPI } from "cheerio";
import type { HeadingEntry, HeadingLevel } from "../types/seo.js";

/** Every heading on the page, in document order, with empty/whitespace-only headings dropped. */
export function extractAllHeadings($: CheerioAPI): HeadingEntry[] {
  const headings: HeadingEntry[] = [];
  $("h1, h2, h3, h4, h5, h6").each((_, el) => {
    const tag = "tagName" in el ? String(el.tagName) : "";
    const level = Number(tag.replace(/[^0-9]/g, "")) as HeadingLevel;
    if (!level || level < 1 || level > 6) return;
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (!text) return;
    headings.push({ level, text });
  });
  return headings;
}

export interface HeadingLevelCounts {
  h1Count: number;
  h2Count: number;
  h3Count: number;
  h4Count: number;
  h5Count: number;
  h6Count: number;
}

export function countHeadingsByLevel(headings: HeadingEntry[]): HeadingLevelCounts {
  const counts: HeadingLevelCounts = { h1Count: 0, h2Count: 0, h3Count: 0, h4Count: 0, h5Count: 0, h6Count: 0 };
  for (const h of headings) {
    counts[`h${h.level}Count` as keyof HeadingLevelCounts] += 1;
  }
  return counts;
}
