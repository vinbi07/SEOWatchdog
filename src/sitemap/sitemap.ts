import axios from "axios";
import { XMLParser } from "fast-xml-parser";
import { config } from "../config/config.js";
import { logger } from "../utils/logger.js";
import { dedupeUrls, isSameDomain, normalizeUrl } from "../utils/urls.js";

const COMMON_SITEMAP_PATHS = ["/sitemap.xml", "/sitemap_index.xml"];

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
});

export interface RobotsInfo {
  sitemaps: string[];
  disallowedPaths: string[];
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await axios.get<string>(url, {
      timeout: config.requestTimeout,
      responseType: "text",
      transformResponse: (d) => d,
      headers: { "User-Agent": config.userAgent },
      validateStatus: (s) => s >= 200 && s < 300,
    });
    return res.data;
  } catch (err) {
    logger.debug(`Failed to fetch ${url}`, err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Parses robots.txt for Sitemap: declarations and Disallow rules that apply
 * to our own user-agent (checked via `*` and the configured UA token).
 */
export async function fetchRobotsInfo(): Promise<RobotsInfo> {
  const robotsUrl = new URL("/robots.txt", config.siteOrigin).toString();
  const text = await fetchText(robotsUrl);
  const sitemaps: string[] = [];
  const disallowedPaths: string[] = [];

  if (!text) {
    return { sitemaps, disallowedPaths };
  }

  let appliesToUs = false;
  const lines = text.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const [rawKey, ...rest] = line.split(":");
    if (!rawKey || rest.length === 0) continue;
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();

    if (key === "sitemap" && value) {
      sitemaps.push(value);
    } else if (key === "user-agent") {
      appliesToUs = value === "*" || config.userAgent.toLowerCase().includes(value.toLowerCase());
    } else if (key === "disallow" && appliesToUs && value) {
      disallowedPaths.push(value);
    }
  }

  return { sitemaps, disallowedPaths };
}

export function isDisallowedByRobots(pathname: string, disallowedPaths: string[]): boolean {
  return disallowedPaths.some((rule) => rule !== "" && pathname.startsWith(rule));
}

interface SitemapUrlEntry {
  loc?: string;
}

interface ParsedUrlset {
  urlset?: { url?: SitemapUrlEntry | SitemapUrlEntry[] };
  sitemapindex?: { sitemap?: SitemapUrlEntry | SitemapUrlEntry[] };
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Recursively fetches and parses a sitemap URL, following sitemap-index
 * references. Returns the flat, deduped list of page URLs discovered.
 */
async function parseSitemapRecursive(sitemapUrl: string, visited: Set<string>, out: Set<string>): Promise<void> {
  const normalized = normalizeUrl(sitemapUrl) ?? sitemapUrl;
  if (visited.has(normalized)) return;
  visited.add(normalized);

  const xml = await fetchText(sitemapUrl);
  if (!xml) {
    logger.warn(`Could not fetch sitemap: ${sitemapUrl}`);
    return;
  }

  let parsed: ParsedUrlset;
  try {
    parsed = xmlParser.parse(xml) as ParsedUrlset;
  } catch (err) {
    logger.warn(`Could not parse sitemap XML: ${sitemapUrl}`, err instanceof Error ? err.message : err);
    return;
  }

  if (parsed.sitemapindex) {
    const children = toArray(parsed.sitemapindex.sitemap);
    for (const child of children) {
      if (child.loc) {
        await parseSitemapRecursive(child.loc, visited, out);
      }
    }
    return;
  }

  if (parsed.urlset) {
    const entries = toArray(parsed.urlset.url);
    for (const entry of entries) {
      if (entry.loc) {
        const norm = normalizeUrl(entry.loc);
        if (norm && isSameDomain(norm, config.siteHost)) {
          out.add(norm);
        }
      }
    }
  }
}

/**
 * Discovers sitemap(s) via robots.txt and common well-known paths, then
 * resolves them (including sitemap indexes) into a deduped list of page URLs.
 */
export async function discoverSitemapUrls(): Promise<{ urls: string[]; robots: RobotsInfo }> {
  const robots = await fetchRobotsInfo();

  const candidateSitemaps = dedupeUrls([
    ...robots.sitemaps,
    ...COMMON_SITEMAP_PATHS.map((p) => new URL(p, config.siteOrigin).toString()),
  ]);

  const visited = new Set<string>();
  const found = new Set<string>();

  for (const sitemapUrl of candidateSitemaps) {
    await parseSitemapRecursive(sitemapUrl, visited, found);
  }

  if (found.size === 0) {
    logger.warn("No sitemap URLs discovered from robots.txt or common locations.");
  }

  return { urls: dedupeUrls(Array.from(found)), robots };
}
