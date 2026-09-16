import type { CheerioAPI } from "cheerio";
import { dedupeUrls, isHttpUrl, isSameDomain, normalizeUrl } from "../utils/urls.js";

export interface LinkExtraction {
  internalLinks: string[];
  externalLinks: string[];
}

export function extractLinks($: CheerioAPI, pageUrl: string, siteHost: string): LinkExtraction {
  const internal = new Set<string>();
  const external = new Set<string>();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const trimmed = href.trim();
    if (!trimmed || trimmed.startsWith("javascript:") || trimmed.startsWith("mailto:") || trimmed.startsWith("tel:")) {
      return;
    }

    const normalized = normalizeUrl(trimmed, pageUrl);
    if (!normalized || !isHttpUrl(normalized)) return;

    if (isSameDomain(normalized, siteHost)) {
      internal.add(normalized);
    } else {
      external.add(normalized);
    }
  });

  return {
    internalLinks: dedupeUrls(Array.from(internal)),
    externalLinks: dedupeUrls(Array.from(external)),
  };
}
