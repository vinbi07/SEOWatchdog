import axios from "axios";
import { config } from "../config/config.js";
import { logger } from "../utils/logger.js";
import type { HostCanonicalizationSummary, Issue } from "../types/seo.js";

function alternateHost(host: string): string {
  return host.toLowerCase().startsWith("www.") ? host.slice(4) : `www.${host}`;
}

export interface HostCanonicalizationResult {
  summary: HostCanonicalizationSummary;
  issue: Issue | null;
}

/**
 * One extra HTTP request per crawl (not per page): checks whether the
 * non-preferred www/non-www host variant of the site cleanly redirects to
 * the preferred host (the one actually configured as SITE_URL), or serves
 * its own independent 200 response — the latter is a real duplicate-content
 * risk (two hosts, same content, no canonical signal between them).
 *
 * Never throws: a network failure here just means the check is
 * inconclusive, which is recorded (wwwRedirectStatus: null) rather than
 * treated as a failure or a false "healthy".
 */
export async function checkHostCanonicalization(siteUrl: string): Promise<HostCanonicalizationResult> {
  const preferredHost = new URL(siteUrl).hostname;
  const altHost = alternateHost(preferredHost);
  const altUrl = `https://${altHost}/`;

  try {
    const res = await axios.get(altUrl, {
      timeout: config.requestTimeout,
      maxRedirects: 0,
      validateStatus: () => true,
      headers: { "User-Agent": config.userAgent },
    });

    const summary: HostCanonicalizationSummary = { preferredHost, wwwRedirectStatus: res.status };

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.location ? new URL(res.headers.location, altUrl).hostname : null;
      if (location === preferredHost) {
        return { summary, issue: null }; // clean redirect to the preferred host
      }
    }

    if (res.status >= 200 && res.status < 300) {
      return {
        summary,
        issue: {
          issueType: "host_canonicalization_issue",
          severity: "high",
          message: `Both https://${preferredHost}/ and ${altUrl} serve independent 200 responses instead of the non-preferred host redirecting to the preferred one.`,
          recommendation: `Configure ${altHost} to redirect (301) to the preferred host (${preferredHost}) to avoid duplicate-content signals.`,
          url: siteUrl,
          value: { preferredHost, alternateHost: altHost, alternateStatus: res.status },
        },
      };
    }

    // Any other status (4xx/5xx, or a redirect to somewhere unexpected) is
    // inconclusive rather than a confirmed problem — don't guess.
    return { summary, issue: null };
  } catch (err) {
    logger.warn(`Host canonicalization check failed for ${altUrl}: ${err instanceof Error ? err.message : String(err)}`);
    return { summary: { preferredHost, wwwRedirectStatus: null }, issue: null };
  }
}
