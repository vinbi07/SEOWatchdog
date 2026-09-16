import { config } from "../config/config.js";
import { logger } from "../utils/logger.js";
import { dedupeUrls, normalizeUrl } from "../utils/urls.js";
import { discoverSitemapUrls, isDisallowedByRobots } from "../sitemap/sitemap.js";
import { fetchPage } from "./fetchPage.js";
import { analyzePage } from "../analyzer/analyzePage.js";
import type { PageResult } from "../types/seo.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs `worker` over `items` with at most `concurrency` in flight at once,
 * pausing `delayMs` between each item a given worker processes so we don't
 * hammer the target site.
 */
async function runPool<T, R>(
  items: T[],
  concurrency: number,
  delayMs: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function runWorker(): Promise<void> {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index]!);
      if (delayMs > 0) await sleep(delayMs);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker());
  await Promise.all(workers);
  return results;
}

/**
 * Discovers sitemap URLs, crawls each one (respecting robots.txt Disallow
 * rules and the configured domain/concurrency/timeout limits), and returns
 * one PageResult per crawled page with `brokenInternalLinks` resolved
 * against the set of pages we actually crawled.
 */
export async function crawlSite(): Promise<PageResult[]> {
  const { urls, robots } = await discoverSitemapUrls();

  let targetUrls = dedupeUrls(urls);

  if (config.maxPages > 0 && targetUrls.length > config.maxPages) {
    logger.warn(`Sitemap contains ${targetUrls.length} URLs; capping at MAX_PAGES=${config.maxPages}`);
    targetUrls = targetUrls.slice(0, config.maxPages);
  }

  const disallowed = new Set<string>();
  const crawlable = targetUrls.filter((url) => {
    const pathname = (() => {
      try {
        return new URL(url).pathname;
      } catch {
        return "";
      }
    })();
    if (isDisallowedByRobots(pathname, robots.disallowedPaths)) {
      disallowed.add(url);
      return false;
    }
    return true;
  });

  if (disallowed.size > 0) {
    logger.info(`Skipping ${disallowed.size} URL(s) disallowed by robots.txt`);
  }

  logger.info(`Crawling ${crawlable.length} URL(s) with concurrency=${config.maxConcurrency}`);

  const pages = await runPool(crawlable, config.maxConcurrency, config.requestDelayMs, async (url) => {
    const fetchResult = await fetchPage(url);
    if (fetchResult.outcome !== "ok") {
      logger.warn(`Failed to crawl ${url}: ${fetchResult.errorMessage ?? `HTTP ${fetchResult.status}`}`);
    }
    return analyzePage(url, fetchResult);
  });

  resolveBrokenInternalLinks(pages);

  return pages;
}

/**
 * Cross-references each page's internal links against the set of URLs we
 * actually crawled. A link is only flagged as broken when we have direct
 * evidence (a 4xx/5xx status) for its target from this same crawl; links to
 * pages outside the crawled set are left unchecked rather than guessed at.
 */
function resolveBrokenInternalLinks(pages: PageResult[]): void {
  const statusByUrl = new Map<string, number | null>();
  for (const page of pages) {
    const key = normalizeUrl(page.finalUrl) ?? page.finalUrl;
    statusByUrl.set(key, page.status);
    const requestedKey = normalizeUrl(page.url) ?? page.url;
    if (!statusByUrl.has(requestedKey)) statusByUrl.set(requestedKey, page.status);
  }

  for (const page of pages) {
    const broken: string[] = [];
    for (const link of page.internalLinks) {
      const key = normalizeUrl(link) ?? link;
      const status = statusByUrl.get(key);
      if (status !== undefined && status !== null && status >= 400) {
        broken.push(link);
      }
    }
    page.brokenInternalLinks = broken;
  }
}
