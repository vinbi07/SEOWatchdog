import { config } from "../config/config.js";
import { logger } from "../utils/logger.js";
import { dedupeUrls, isCrawlableDiscoveredUrl, normalizeUrl } from "../utils/urls.js";
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

export interface CrawlResult {
  pages: PageResult[];
  /** Normalized sitemap URLs, for sitemap-coverage comparisons downstream. */
  sitemapUrls: Set<string>;
}

export interface CrawlProgress {
  pagesDiscovered: number;
  pagesCrawled: number;
}

interface ProgressTracker {
  discovered: number;
  crawled: number;
  report(): void;
}

function makeProgressTracker(onProgress?: (progress: CrawlProgress) => void): ProgressTracker {
  const tracker: ProgressTracker = {
    discovered: 0,
    crawled: 0,
    report() {
      onProgress?.({ pagesDiscovered: tracker.discovered, pagesCrawled: tracker.crawled });
    },
  };
  return tracker;
}

function safePathname(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}

async function fetchAndAnalyze(url: string): Promise<PageResult> {
  const fetchResult = await fetchPage(url);
  if (fetchResult.outcome !== "ok") {
    logger.warn(`Failed to crawl ${url}: ${fetchResult.errorMessage ?? `HTTP ${fetchResult.status}`}`);
  }
  return analyzePage(url, fetchResult);
}

/**
 * Discovers sitemap URLs, crawls each one, then (when enabled) follows
 * internal links found on those pages to discover and crawl additional
 * pages that aren't listed in the sitemap — up to MAX_DISCOVERED_PAGES
 * additional pages and MAX_CRAWL_DEPTH link-hops from the sitemap seeds.
 * Respects robots.txt Disallow rules throughout. Returns one PageResult
 * per crawled page, with `brokenInternalLinks` and internal inbound/
 * outbound link counts resolved against the full crawled set.
 */
export async function crawlSite(onProgress?: (progress: CrawlProgress) => void): Promise<CrawlResult> {
  const tracker = makeProgressTracker(onProgress);
  const { urls, robots } = await discoverSitemapUrls();

  let sitemapTargets = dedupeUrls(urls);
  if (config.maxPages > 0 && sitemapTargets.length > config.maxPages) {
    logger.warn(`Sitemap contains ${sitemapTargets.length} URLs; capping at MAX_PAGES=${config.maxPages}`);
    sitemapTargets = sitemapTargets.slice(0, config.maxPages);
  }

  const sitemapUrls = new Set(sitemapTargets.map((u) => normalizeUrl(u) ?? u));

  const isAllowed = (url: string): boolean => !isDisallowedByRobots(safePathname(url), robots.disallowedPaths);

  const disallowedSitemapUrls = sitemapTargets.filter((u) => !isAllowed(u));
  if (disallowedSitemapUrls.length > 0) {
    logger.info(`Skipping ${disallowedSitemapUrls.length} sitemap URL(s) disallowed by robots.txt`);
  }
  const crawlableSitemapUrls = sitemapTargets.filter(isAllowed);

  logger.info(`Crawling ${crawlableSitemapUrls.length} sitemap URL(s) with concurrency=${config.maxConcurrency}`);

  tracker.discovered = crawlableSitemapUrls.length;
  tracker.report();

  const pages = await runPool(crawlableSitemapUrls, config.maxConcurrency, config.requestDelayMs, async (url) => {
    const result = await fetchAndAnalyze(url);
    tracker.crawled += 1;
    tracker.report();
    return result;
  });
  for (const page of pages) {
    page.sources.sitemap = true;
  }

  const visited = new Set<string>(pages.map((p) => normalizeUrl(p.finalUrl) ?? p.finalUrl));
  for (const url of crawlableSitemapUrls) {
    visited.add(normalizeUrl(url) ?? url);
  }

  if (config.discoverInternalUrls) {
    await discoverAdditionalPages(pages, visited, isAllowed, tracker);
  }

  resolveBrokenInternalLinks(pages);
  resolveInternalInboundLinkCounts(pages);
  resolvePageSources(pages);

  return { pages, sitemapUrls };
}

/**
 * BFS over internal links found on already-crawled pages, crawling newly
 * discovered same-domain HTML-page URLs (skipping assets, disallowed
 * paths, and URLs already visited) up to the configured depth/page budget.
 * Mutates `pages` and `visited` in place as it goes.
 */
async function discoverAdditionalPages(
  pages: PageResult[],
  visited: Set<string>,
  isAllowed: (url: string) => boolean,
  tracker: ProgressTracker
): Promise<void> {
  let frontier = collectNewLinkTargets(pages, visited, isAllowed);
  let depth = 1;
  let discoveredCount = 0;

  while (frontier.length > 0 && depth <= config.maxCrawlDepth && discoveredCount < config.maxDiscoveredPages) {
    const remainingBudget = config.maxDiscoveredPages - discoveredCount;
    const batch = frontier.slice(0, remainingBudget);

    for (const url of batch) visited.add(url);

    logger.info(`Discovery depth ${depth}: crawling ${batch.length} newly discovered URL(s)`);

    tracker.discovered += batch.length;
    tracker.report();

    const newPages = await runPool(batch, config.maxConcurrency, config.requestDelayMs, async (url) => {
      const result = await fetchAndAnalyze(url);
      tracker.crawled += 1;
      tracker.report();
      return result;
    });
    for (const page of newPages) {
      page.sources.discovered = true;
      visited.add(normalizeUrl(page.finalUrl) ?? page.finalUrl);
    }
    pages.push(...newPages);
    discoveredCount += newPages.length;

    if (discoveredCount >= config.maxDiscoveredPages) {
      logger.warn(`Reached MAX_DISCOVERED_PAGES=${config.maxDiscoveredPages}; stopping discovery.`);
      break;
    }

    frontier = collectNewLinkTargets(newPages, visited, isAllowed);
    depth += 1;
  }

  if (frontier.length > 0 && depth > config.maxCrawlDepth) {
    logger.warn(`Reached MAX_CRAWL_DEPTH=${config.maxCrawlDepth} with ${frontier.length} URL(s) still undiscovered.`);
  }
}

function collectNewLinkTargets(
  pages: PageResult[],
  visited: Set<string>,
  isAllowed: (url: string) => boolean
): string[] {
  const targets = new Set<string>();
  for (const page of pages) {
    for (const link of page.internalLinks) {
      const normalized = normalizeUrl(link);
      if (!normalized) continue;
      if (visited.has(normalized)) continue;
      if (!isCrawlableDiscoveredUrl(normalized)) continue;
      if (!isAllowed(normalized)) continue;
      targets.add(normalized);
    }
  }
  return Array.from(targets);
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

/**
 * Ensures `sources.discovered` reflects where a URL was actually observed,
 * not just which crawl round happened to process it first. A page crawled
 * via the sitemap round can still be `discovered: true` if some other
 * crawled page also links to it internally. Exported for unit testing.
 */
export function resolvePageSources(pages: PageResult[]): void {
  const linkedTargets = new Set<string>();
  for (const page of pages) {
    const sourceKey = normalizeUrl(page.finalUrl) ?? page.finalUrl;
    for (const link of page.internalLinks) {
      const key = normalizeUrl(link) ?? link;
      if (key === sourceKey) continue; // a page linking to itself doesn't count as being "discovered"
      linkedTargets.add(key);
    }
  }

  for (const page of pages) {
    const key = normalizeUrl(page.finalUrl) ?? page.finalUrl;
    const requestedKey = normalizeUrl(page.url) ?? page.url;
    if (linkedTargets.has(key) || linkedTargets.has(requestedKey)) {
      page.sources.discovered = true;
    }
  }
}

/**
 * Counts, for each crawled page, how many *other* crawled pages link to it
 * internally. Exported for unit testing.
 */
export function resolveInternalInboundLinkCounts(pages: PageResult[]): void {
  const inboundCounts = new Map<string, number>();

  for (const page of pages) {
    const sourceKey = normalizeUrl(page.finalUrl) ?? page.finalUrl;
    const targets = new Set(page.internalLinks.map((link) => normalizeUrl(link) ?? link));
    targets.delete(sourceKey); // don't count self-links

    for (const target of targets) {
      inboundCounts.set(target, (inboundCounts.get(target) ?? 0) + 1);
    }
  }

  for (const page of pages) {
    const key = normalizeUrl(page.finalUrl) ?? page.finalUrl;
    page.internalInboundLinkCount = inboundCounts.get(key) ?? 0;
  }
}
