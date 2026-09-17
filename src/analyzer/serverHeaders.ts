import type { ServerHeaders } from "../types/seo.js";

/**
 * Picks out a small, deliberately curated set of response headers rather
 * than storing the full header dump (see README/dashboard "Technical
 * Details"). `headers` keys are assumed already-lowercased (axios does this
 * by default — see fetchPage.ts).
 */
export function extractServerHeaders(headers: Record<string, string>): ServerHeaders {
  return {
    server: headers["server"] ?? null,
    xPoweredBy: headers["x-powered-by"] ?? null,
    contentType: headers["content-type"] ?? null,
    cacheControl: headers["cache-control"] ?? null,
    contentSecurityPolicy: headers["content-security-policy"] ?? null,
    strictTransportSecurity: headers["strict-transport-security"] ?? null,
  };
}

export function extractCompressionEncoding(headers: Record<string, string>): string | null {
  const value = headers["content-encoding"];
  return value && value.trim() ? value.trim().toLowerCase() : null;
}
