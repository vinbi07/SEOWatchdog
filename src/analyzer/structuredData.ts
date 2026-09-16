import type { CheerioAPI } from "cheerio";
import type { StructuredDataDetail, StructuredDataEntry } from "../types/seo.js";

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

/** JSON-LD @type value(s), normalized to a string array. */
function typesOf(node: Record<string, unknown>): string[] {
  if (typeof node["@type"] === "string") return [node["@type"]];
  if (Array.isArray(node["@type"])) return node["@type"].filter((t): t is string => typeof t === "string");
  return [];
}

function collectTypes(node: unknown, out: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) collectTypes(item, out);
    return;
  }
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    for (const t of typesOf(obj)) out.add(t);
    if (Array.isArray(obj["@graph"])) {
      collectTypes(obj["@graph"], out);
    }
  }
}

/** Flattens JSON-LD (including @graph) into a list of plain object nodes. */
function collectNodes(node: unknown, out: Record<string, unknown>[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collectNodes(item, out);
    return;
  }
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    out.push(obj);
    if (Array.isArray(obj["@graph"])) {
      collectNodes(obj["@graph"], out);
    }
  }
}

function stringField(node: Record<string, unknown>, key: string): string | undefined {
  const value = node[key];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
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

  for (const parsed of parseJsonLdBlocks($)) {
    collectTypes(parsed, types);
  }

  for (const type of types) {
    entries.push({ type });
  }

  return entries;
}

/**
 * Extracts field-level detail for structured-data types we know how to
 * read (currently PodcastEpisode: datePublished, dateModified,
 * episodeNumber, name, url). Other types are only reported via the
 * plain @type list from extractStructuredData, not here.
 */
export function extractStructuredDataDetails($: CheerioAPI): StructuredDataDetail[] {
  const details: StructuredDataDetail[] = [];

  for (const parsed of parseJsonLdBlocks($)) {
    const nodes: Record<string, unknown>[] = [];
    collectNodes(parsed, nodes);

    for (const node of nodes) {
      if (!typesOf(node).includes("PodcastEpisode")) continue;

      const episodeNumberRaw = node["episodeNumber"];
      const episodeNumber =
        typeof episodeNumberRaw === "number" || typeof episodeNumberRaw === "string" ? episodeNumberRaw : undefined;

      details.push({
        type: "PodcastEpisode",
        datePublished: stringField(node, "datePublished"),
        dateModified: stringField(node, "dateModified"),
        episodeNumber,
        name: stringField(node, "name"),
        url: stringField(node, "url"),
      });
    }
  }

  return details;
}

function parseJsonLdBlocks($: CheerioAPI): unknown[] {
  const parsed: unknown[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    if (!raw || !raw.trim()) return;
    try {
      parsed.push(JSON.parse(raw));
    } catch {
      // Malformed JSON-LD is untrusted input; skip silently rather than crash the crawl.
    }
  });
  return parsed;
}

export function isKnownSchemaType(type: string): boolean {
  return KNOWN_TYPES.has(type);
}
