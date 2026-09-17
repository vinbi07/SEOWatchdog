import type { CheerioAPI } from "cheerio";
import type { AlternateLink } from "../types/seo.js";

/** Raw `<link rel="alternate" hreflang="...">` tags, exactly as declared (validation happens in rules/hreflangRules.ts). */
export function extractAlternateLinks($: CheerioAPI): AlternateLink[] {
  const links: AlternateLink[] = [];
  $('link[rel="alternate" i][hreflang]').each((_, el) => {
    const hreflang = ($(el).attr("hreflang") ?? "").trim();
    const href = ($(el).attr("href") ?? "").trim();
    if (!hreflang && !href) return;
    links.push({ hreflang, href });
  });
  return links;
}
