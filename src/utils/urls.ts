/**
 * URL normalization and helpers shared by the sitemap parser, crawler, and analyzer.
 *
 * Normalization rules:
 *  - resolve relative URLs against a base
 *  - strip the fragment (#...)
 *  - lowercase the hostname
 *  - drop default ports (80 for http, 443 for https)
 *  - strip a single trailing slash from the path, except for the root "/"
 */
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
