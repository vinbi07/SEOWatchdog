/**
 * Minimal, read-only local dashboard for SEO Watchdog.
 *
 * This is a plain Node `http` server (no framework) that:
 *  - holds the Supabase service role key server-side only,
 *  - exposes a small JSON API under /api/*,
 *  - serves the static dashboard page from public/dashboard/.
 *
 * The browser never sees SUPABASE_SERVICE_ROLE_KEY. It only talks to this
 * local server. Intended for local/internal use — see README "Dashboard"
 * section.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config/config.js";
import { getSupabaseClient, isSupabaseConfigured } from "../db/supabaseClient.js";
import { logger } from "../utils/logger.js";
import {
  getChangesForCrawlRun,
  getCrawlHistory,
  getIssuesForCrawlRun,
  getLatestCrawlRun,
  getPagesForCrawlRun,
  getRecentChanges,
  listSites,
} from "./queries.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, "../../public/dashboard");

const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function sendJson(res: import("node:http").ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(payload);
}

function summarizeSinceLastCrawl(changes: Array<Record<string, unknown>>) {
  const count = (predicate: (c: Record<string, unknown>) => boolean) => changes.filter(predicate).length;
  const changedPageUrls = new Set(
    changes
      .filter((c) => c.entity_type === "page" && c.event_type !== "page_new" && c.event_type !== "page_removed")
      .map((c) => c.url)
  );
  return {
    newIssues: count((c) => c.event_type === "issue_new"),
    resolvedIssues: count((c) => c.event_type === "issue_resolved"),
    ongoingIssues: count((c) => c.event_type === "issue_ongoing"),
    newPages: count((c) => c.event_type === "page_new"),
    removedPages: count((c) => c.event_type === "page_removed"),
    changedPages: changedPageUrls.size,
  };
}

async function handleApi(pathname: string, searchParams: URLSearchParams): Promise<{ status: number; body: unknown }> {
  const client = getSupabaseClient();

  if (pathname === "/api/sites") {
    return { status: 200, body: await listSites(client) };
  }

  const siteId = searchParams.get("siteId");

  if (pathname === "/api/latest-crawl") {
    if (!siteId) return { status: 400, body: { error: "siteId is required" } };
    const latest = await getLatestCrawlRun(client, siteId);
    if (!latest) return { status: 200, body: { crawlRun: null, sinceLastCrawl: null } };
    const changes = await getChangesForCrawlRun(client, latest.id);
    return { status: 200, body: { crawlRun: latest, sinceLastCrawl: summarizeSinceLastCrawl(changes) } };
  }

  if (pathname === "/api/crawl-history") {
    if (!siteId) return { status: 400, body: { error: "siteId is required" } };
    const limit = Number(searchParams.get("limit") ?? "20");
    return { status: 200, body: await getCrawlHistory(client, siteId, limit) };
  }

  if (pathname === "/api/changes") {
    if (!siteId) return { status: 400, body: { error: "siteId is required" } };
    const limit = Number(searchParams.get("limit") ?? "100");
    const eventType = searchParams.get("eventType") ?? undefined;
    const severity = searchParams.get("severity") ?? undefined;
    return { status: 200, body: await getRecentChanges(client, siteId, { limit, eventType, severity }) };
  }

  if (pathname === "/api/issues") {
    const crawlRunId = searchParams.get("crawlRunId");
    if (!siteId && !crawlRunId) return { status: 400, body: { error: "siteId or crawlRunId is required" } };
    const resolvedCrawlRunId = crawlRunId ?? (await getLatestCrawlRun(client, siteId!))?.id;
    if (!resolvedCrawlRunId) return { status: 200, body: [] };
    const issues = await getIssuesForCrawlRun(client, resolvedCrawlRunId);
    issues.sort((a, b) => (SEVERITY_RANK[a.severity] ?? 4) - (SEVERITY_RANK[b.severity] ?? 4) || a.url.localeCompare(b.url));
    return { status: 200, body: issues };
  }

  if (pathname === "/api/pages") {
    const crawlRunId = searchParams.get("crawlRunId");
    if (!siteId && !crawlRunId) return { status: 400, body: { error: "siteId or crawlRunId is required" } };
    const resolvedCrawlRunId = crawlRunId ?? (await getLatestCrawlRun(client, siteId!))?.id;
    if (!resolvedCrawlRunId) return { status: 200, body: [] };
    const [pages, issues] = await Promise.all([
      getPagesForCrawlRun(client, resolvedCrawlRunId),
      getIssuesForCrawlRun(client, resolvedCrawlRunId),
    ]);
    const issueCountByUrl = new Map<string, number>();
    for (const issue of issues) {
      issueCountByUrl.set(issue.url, (issueCountByUrl.get(issue.url) ?? 0) + 1);
    }
    const pagesWithIssueCounts = pages.map((page) => ({ ...page, issue_count: issueCountByUrl.get(page.url) ?? 0 }));
    return { status: 200, body: pagesWithIssueCounts };
  }

  return { status: 404, body: { error: "Not found" } };
}

async function serveStatic(pathname: string): Promise<{ status: number; contentType: string; body: Buffer } | null> {
  const relativePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.join(PUBLIC_DIR, relativePath);

  if (!filePath.startsWith(PUBLIC_DIR)) return null; // reject path traversal

  try {
    const body = await readFile(filePath);
    const ext = path.extname(filePath);
    return { status: 200, contentType: MIME_TYPES[ext] ?? "application/octet-stream", body };
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://localhost:${config.dashboardPort}`);

    if (url.pathname.startsWith("/api/")) {
      if (!isSupabaseConfigured()) {
        sendJson(res, 503, {
          error: "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to use the dashboard.",
        });
        return;
      }
      const { status, body } = await handleApi(url.pathname, url.searchParams);
      sendJson(res, status, body);
      return;
    }

    const staticFile = await serveStatic(url.pathname);
    if (staticFile) {
      res.writeHead(staticFile.status, { "Content-Type": staticFile.contentType });
      res.end(staticFile.body);
      return;
    }

    const fallback = await serveStatic("/index.html");
    if (fallback) {
      res.writeHead(200, { "Content-Type": fallback.contentType });
      res.end(fallback.body);
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  } catch (err) {
    logger.error("Dashboard request failed", err instanceof Error ? err.message : err);
    sendJson(res, 500, { error: "Internal error" });
  }
});

server.listen(config.dashboardPort, () => {
  logger.info(`SEO Watchdog dashboard (read-only) listening on http://localhost:${config.dashboardPort}`);
  if (!isSupabaseConfigured()) {
    logger.warn("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set — dashboard API calls will return 503.");
  }
});
