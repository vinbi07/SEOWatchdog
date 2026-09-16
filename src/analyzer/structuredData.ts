import type { CheerioAPI } from "cheerio";
import type { StructuredDataEntry } from "../types/seo.js";

const KNOWN_TYPES = new Set([
  "Organization",
  "WebSite",
  "WebPage",
  "Person",
  "PodcastSeries",
  "PodcastEpisode",
  "BreadcrumbList",
  "Article",
  "VideoObject",
]);

function collectTypes(node: unknown, out: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) collectTypes(item, out);
    return;
  }
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if (typeof obj["@type"] === "string") {
      out.add(obj["@type"]);
    } else if (Array.isArray(obj["@type"])) {
      for (const t of obj["@type"]) {
        if (typeof t === "string") out.add(t);
      }
    }
    if (Array.isArray(obj["@graph"])) {
      collectTypes(obj["@graph"], out);
    }
  }
}

/**
 * Parses every JSON-LD <script> block on the page (never executed, only
 * JSON.parse'd) and returns the distinct schema.org @type values found.
 * Unrecognized types are still reported; KNOWN_TYPES is only a reference
 * list used by callers/documentation, not a filter.
 */
export function extractStructuredData($: CheerioAPI): StructuredDataEntry[] {
  const entries: StructuredDataEntry[] = [];
  const types = new Set<string>();

  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    if (!raw || !raw.trim()) return;
    try {
      const parsed = JSON.parse(raw);
      collectTypes(parsed, types);
    } catch {
      // Malformed JSON-LD is untrusted input; skip silently rather than crash the crawl.
    }
  });

  for (const type of types) {
    entries.push({ type });
  }

  return entries;
}

export function isKnownSchemaType(type: string): boolean {
  return KNOWN_TYPES.has(type);
}
