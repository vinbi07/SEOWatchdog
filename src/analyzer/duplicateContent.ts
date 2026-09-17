import type { CheerioAPI } from "cheerio";
import { thresholds } from "../rules/thresholds.js";
import type { DuplicateContentSample } from "../types/seo.js";

function normalizeBlock(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Visible text blocks from content-bearing elements only. Excludes nav,
 * header, footer, and common boilerplate containers up front (by tag/role/
 * class heuristics) rather than trying to detect "is this a repeated
 * component" after the fact — cheaper and more conservative.
 */
export function extractVisibleTextBlocks($: CheerioAPI): string[] {
  const root = $("body").clone();
  root.find("script, style, noscript, template, nav, header, footer, [role='navigation'], [role='banner'], [role='contentinfo']").remove();

  const blocks: string[] = [];
  root.find("p, li, h1, h2, h3, h4, h5, h6, blockquote, figcaption").each((_, el) => {
    const text = normalizeBlock($(el).text());
    if (text) blocks.push(text);
  });
  return blocks;
}

/**
 * Groups blocks by normalized text, ignoring anything shorter than the
 * configured minimum (nav labels, button copy, short captions), and returns
 * the ones that repeat — capped to a small number of truncated samples so
 * we never persist large text dumps.
 */
export function findDuplicateVisibleContent(blocks: string[]): DuplicateContentSample[] {
  const counts = new Map<string, number>();
  for (const block of blocks) {
    if (block.length < thresholds.duplicateContent.minBlockLength) continue;
    counts.set(block, (counts.get(block) ?? 0) + 1);
  }

  const duplicates: DuplicateContentSample[] = [];
  for (const [text, occurrences] of counts) {
    if (occurrences < 2) continue;
    duplicates.push({
      text: text.length > thresholds.duplicateContent.sampleTruncateLength ? `${text.slice(0, thresholds.duplicateContent.sampleTruncateLength)}…` : text,
      occurrences,
    });
  }

  return duplicates
    .sort((a, b) => b.occurrences - a.occurrences)
    .slice(0, thresholds.duplicateContent.maxSamplesStored);
}
