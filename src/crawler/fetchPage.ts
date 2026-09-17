import axios, { AxiosError } from "axios";
import { config } from "../config/config.js";
import { normalizeUrl } from "../utils/urls.js";

const MAX_REDIRECTS = 10;

/** Axios already lowercases header names; this just flattens any multi-value headers to a single string. */
function normalizeHeaders(raw: Record<string, unknown>): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined || value === null) continue;
    headers[key] = Array.isArray(value) ? value.join(", ") : String(value);
  }
  return headers;
}

export interface FetchResult {
  requestedUrl: string;
  finalUrl: string;
  status: number | null;
  redirectCount: number;
  responseTimeMs: number;
  html: string | null;
  /** The final (non-redirect) response's headers, lowercased keys — empty for network_error outcomes. */
  headers: Record<string, string>;
  outcome: "ok" | "http_error" | "network_error";
  errorMessage?: string;
}

/**
 * Fetches a URL, manually following redirects one hop at a time so we can
 * count them and detect redirect loops. Treats 2xx as success; captures
 * 4xx/5xx as `http_error` (with body when available); network failures /
 * timeouts as `network_error`. Never crashes — always resolves.
 */
export async function fetchPage(url: string): Promise<FetchResult> {
  const start = Date.now();
  let currentUrl = url;
  let redirectCount = 0;
  const visited = new Set<string>();

  try {
    while (true) {
      if (visited.has(currentUrl)) {
        return {
          requestedUrl: url,
          finalUrl: currentUrl,
          status: null,
          redirectCount,
          responseTimeMs: Date.now() - start,
          html: null,
          headers: {},
          outcome: "network_error",
          errorMessage: "Redirect loop detected",
        };
      }
      visited.add(currentUrl);

      const res = await axios.get<string>(currentUrl, {
        timeout: config.requestTimeout,
        responseType: "text",
        transformResponse: (d) => d,
        maxRedirects: 0,
        validateStatus: () => true,
        headers: {
          "User-Agent": config.userAgent,
          Accept: "text/html,application/xhtml+xml",
        },
      });

      if (res.status >= 300 && res.status < 400 && res.headers.location) {
        redirectCount += 1;
        if (redirectCount > MAX_REDIRECTS) {
          return {
            requestedUrl: url,
            finalUrl: currentUrl,
            status: res.status,
            redirectCount,
            responseTimeMs: Date.now() - start,
            html: null,
            headers: {},
            outcome: "network_error",
            errorMessage: "Too many redirects",
          };
        }
        const next = normalizeUrl(res.headers.location, currentUrl);
        if (!next) {
          return {
            requestedUrl: url,
            finalUrl: currentUrl,
            status: res.status,
            redirectCount,
            responseTimeMs: Date.now() - start,
            html: null,
            headers: {},
            outcome: "network_error",
            errorMessage: `Invalid redirect location: ${res.headers.location}`,
          };
        }
        currentUrl = next;
        continue;
      }

      const outcome = res.status >= 200 && res.status < 300 ? "ok" : "http_error";
      return {
        requestedUrl: url,
        finalUrl: currentUrl,
        status: res.status,
        redirectCount,
        responseTimeMs: Date.now() - start,
        html: typeof res.data === "string" ? res.data : null,
        headers: normalizeHeaders(res.headers as Record<string, unknown>),
        outcome,
      };
    }
  } catch (err) {
    const message =
      err instanceof AxiosError
        ? err.code === "ECONNABORTED"
          ? "Request timed out"
          : err.message
        : err instanceof Error
          ? err.message
          : "Unknown network error";
    return {
      requestedUrl: url,
      finalUrl: currentUrl,
      status: null,
      redirectCount,
      responseTimeMs: Date.now() - start,
      html: null,
      headers: {},
      outcome: "network_error",
      errorMessage: message,
    };
  }
}
