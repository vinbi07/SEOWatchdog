/**
 * URL normalization and helpers shared by the sitemap parser, crawler, and analyzer.
 *
 * Normalization rules:
 *  - resolve relative URLs against a base
 *  - strip the fragment (#...)
 *  - lowercase the hostname
 *  - drop default ports (80 for http, 443 for https)
 *  - strip a single trailing slash from the path, except for the root "/"
 *  - strip known tracking/analytics query parameters (utm_*, fbclid, gclid, ...)
 *
 * Stripping tracking parameters means a link like `?utm_source=newsletter`
 * normalizes to the same URL as the bare page, which is what lets the
 * crawler dedupe tracking-parameter variants instead of treating them as
 * distinct pages.
 */
const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "fbclid",
  "gclid",
  "gclsrc",
  "msclkid",
  "mc_cid",
  "mc_eid",
  "ref",
  "ref_src",
  "igshid",
]);

export function normalizeUrl(rawUrl: string, base?: string): string | null {
  try {
    const url = base ? new URL(rawUrl, base) : new URL(rawUrl);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    if ((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443")) {
      url.port = "";
    }
    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }

    for (const key of Array.from(url.searchParams.keys())) {
      if (TRACKING_PARAMS.has(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }
    url.searchParams.sort();

    return url.toString();
  } catch {
    return null;
  }
}

export function isSameDomain(url: string, siteHost: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname.toLowerCase() === siteHost.toLowerCase();
  } catch {
    return false;
  }
}

export function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function dedupeUrls(urls: string[]): string[] {
  return Array.from(new Set(urls));
}

export function toDisplayPath(url: string, siteOrigin: string): string {
  if (url.startsWith(siteOrigin)) {
    const rest = url.slice(siteOrigin.length);
    return rest === "" ? "/" : rest;
  }
  return url;
}

const ASSET_EXTENSIONS = new Set([
  // images
  "jpg",
  "jpeg",
  "png",
  "gif",
  "svg",
  "webp",
  "avif",
  "ico",
  "bmp",
  "tiff",
  // stylesheets / scripts
  "css",
  "js",
  "mjs",
  "map",
  "json",
  "xml",
  // documents / downloads
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "zip",
  "rar",
  "7z",
  "csv",
  "txt",
  // fonts
  "woff",
  "woff2",
  "ttf",
  "eot",
  "otf",
  // media
  "mp4",
  "mov",
  "avi",
  "webm",
  "mkv",
  "mp3",
  "wav",
  "m4a",
  "ogg",
]);

/**
 * Heuristic: does this URL's path look like a static asset rather than an
 * HTML page, based on its file extension? Used to keep link discovery from
 * trying to "crawl" images, stylesheets, PDFs, etc.
 */
export function isLikelyAssetUrl(url: string): boolean {
  try {
    const { pathname } = new URL(url);
    const lastSegment = pathname.split("/").pop() ?? "";
    const dotIndex = lastSegment.lastIndexOf(".");
    if (dotIndex === -1) return false;
    const ext = lastSegment.slice(dotIndex + 1).toLowerCase();
    return ASSET_EXTENSIONS.has(ext);
  } catch {
    return false;
  }
}

const MAX_DISCOVERY_QUERY_PARAMS = 2;

/**
 * Decides whether a URL discovered via an internal link is a reasonable
 * candidate to crawl during discovery (as opposed to a sitemap URL, which
 * is always crawled). Rejects assets and URLs still carrying more than a
 * couple of non-tracking query parameters after normalization, since those
 * are usually filtered/paginated view variants rather than distinct pages.
 */
export function isCrawlableDiscoveredUrl(url: string): boolean {
  if (isLikelyAssetUrl(url)) return false;
  try {
    const parsed = new URL(url);
    return Array.from(parsed.searchParams.keys()).length <= MAX_DISCOVERY_QUERY_PARAMS;
  } catch {
    return false;
  }
}
