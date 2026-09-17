import type { CheerioAPI } from "cheerio";

const RESOURCE_SELECTORS = [
  "script[src]",
  "link[href][rel='stylesheet']",
  "link[href][rel='preload']",
  "link[href][rel='icon']",
  "img[src]",
  "source[src]",
  "video[src]",
  "audio[src]",
  "iframe[src]",
];

/**
 * Finds resource URLs hardcoded as `http://` on a page served over HTTPS —
 * a genuine mixed-content risk, distinct from relative URLs (which inherit
 * the page's own scheme). Only checked when the page itself is HTTPS.
 * mailto:/tel:/data:/blob: never match, since they don't start with
 * "http://" at all.
 */
export function findMixedContentUrls($: CheerioAPI, pageIsHttps: boolean): string[] {
  if (!pageIsHttps) return [];

  const found = new Set<string>();
  for (const selector of RESOURCE_SELECTORS) {
    $(selector).each((_, el) => {
      const attrName = selector.startsWith("link") ? "href" : "src";
      const raw = $(el).attr(attrName);
      if (raw && raw.trim().toLowerCase().startsWith("http://")) {
        found.add(raw.trim());
      }
    });
  }
  return Array.from(found);
}
