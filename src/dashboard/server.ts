/**
 * Local dashboard for SEO Watchdog.
 *
 * This is a plain Node `http` server (no framework) that:
 *  - holds the Supabase service role key server-side only,
 *  - exposes a small JSON API under /api/* (read-only, plus one guarded
 *    mutating endpoint: POST /api/trigger-scan, see scanControl.ts),
 *  - serves the static dashboard page from public/dashboard/.
 *
 * The browser never sees SUPABASE_SERVICE_ROLE_KEY. It only talks to this
 * local server. Intended for local/internal use — see README "Dashboard"
 * section.
 */
import { createServer, type IncomingMessage } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config/config.js";
import { getSupabaseClient, isSupabaseConfigured } from "../db/supabaseClient.js";
import { logger } from "../utils/logger.js";
import { computeCrawlFreshness, computeOverallStatus, summarizeSinceLastCrawl } from "./aggregate.js";
import { checkTriggerAuth, killActiveChild, reconcileStaleRun, triggerScan } from "./scanControl.js";
import {
  getChangesForCrawlRun,
  getChangesForUrl,
  getCrawlHistoryWithChangeCounts,
  getCrawlRunById,
  getCurrentIssueByKey,
  getCurrentIssues,
  getLatestCrawlRun,
  getLatestPageByUrl,
  getLatestPages,
  getPreviousCrawlRun,
  getRecentChanges,
  getResolvedIssues,
  getScoreHistory,
  getScoreSnapshotForCrawlRun,
  listSites,
} from "./queries.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, "../../public/dashboard");

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

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
  } catch {
    return {};
  }
}

async function handleTriggerScan(req: IncomingMessage): Promise<{ status: number; body: unknown }> {
  const auth = checkTriggerAuth(req);
  if (auth === "not_configured") {
    return { status: 501, body: { error: "Manual scan triggering is not enabled. Set DASHBOARD_ADMIN_TOKEN to enable it." } };
  }
  if (auth === "unauthorized") {
    return { status: 401, body: { error: "Missing or invalid admin token." } };
  }

  const body = (await readJsonBody(req)) as { siteId?: unknown; siteUrl?: unknown };
  const siteId = typeof body.siteId === "string" ? body.siteId : null;
  const siteUrl = typeof body.siteUrl === "string" ? body.siteUrl : null;
  if (!siteId && !siteUrl) return { status: 400, body: { error: "siteId or siteUrl is required" } };

  const client = getSupabaseClient();
  const result = await triggerScan(client, siteId ? { siteId } : { siteUrl: siteUrl! });

  if (result.ok) {
    return { status: 202, body: { success: true, siteId: result.siteId, crawlRunId: result.crawlRunId, status: "started" } };
  }

  if (result.reason === "already_running") {
    return {
      status: 409,
      body: { success: false, crawlRunId: result.activeCrawlRunId, status: "already_running" },
    };
  }

  if (result.reason === "cooldown") {
    return {
      status: 429,
      body: { success: false, crawlRunId: null, status: "cooldown", retryAfterSeconds: result.retryAfterSeconds },
    };
  }

  if (result.reason === "invalid_url") {
    return { status: 400, body: { success: false, crawlRunId: null, status: "invalid_url" } };
  }

  return { status: 404, body: { success: false, crawlRunId: null, status: "site_not_found" } };
}

async function handleApi(pathname: string, searchParams: URLSearchParams): Promise<{ status: number; body: unknown }> {
  const client = getSupabaseClient();

  if (pathname === "/api/meta") {
    return { status: 200, body: { environment: config.dashboardEnvironment, staleHours: config.dashboardStaleHours } };
  }

  if (pathname === "/api/sites") {
    return { status: 200, body: await listSites(client) };
  }

  const siteId = searchParams.get("siteId");

  if (pathname === "/api/latest-crawl") {
    if (!siteId) return { status: 400, body: { error: "siteId is required" } };

    let latest = await getLatestCrawlRun(client, siteId);
    if (latest?.status === "running") {
      // Self-heal a stale/timed-out run before rendering it, so a poll
      // never shows "SCANNING" forever after a server crash or a runaway phase.
      await reconcileStaleRun(client, siteId);
      latest = await getLatestCrawlRun(client, siteId);
    }
    if (!latest) return { status: 200, body: { crawlRun: null, sinceLastCrawl: null, status: null, freshness: null, score: null } };

    const isActive = latest.status === "running";

    if (isActive) {
      // A running crawl has no finished_at/severity counts/score yet — skip
      // the change/score/freshness queries that assume a completed run.
      return {
        status: 200,
        body: { crawlRun: { ...latest, isActive }, sinceLastCrawl: null, status: null, freshness: null, score: null },
      };
    }

    const [changes, score] = await Promise.all([
      getChangesForCrawlRun(client, latest.id),
      getScoreSnapshotForCrawlRun(client, latest.id),
    ]);
    const sinceLastCrawl = summarizeSinceLastCrawl(changes);
    const status = computeOverallStatus({
      criticalCount: latest.critical_count,
      highCount: latest.high_count,
      noindexUnexpectedCount: latest.noindex_unexpected_count,
      // Major HTTP failures (crawl_failure/server_error) are always severity
      // "critical" in the rules engine, so they're already captured by
      // criticalCount — no separate query needed to check for them.
      majorHttpFailureCount: 0,
      newIssuesSinceLastCrawl: sinceLastCrawl.newIssues,
    });
    const freshness = computeCrawlFreshness(latest.finished_at ?? latest.started_at, new Date(), config.dashboardStaleHours);

    // score is null for crawls that predate Step 2.7 or haven't been backfilled yet — never an error.
    return {
      status: 200,
      body: { crawlRun: { ...latest, isActive }, sinceLastCrawl, status, freshness, score: score ?? null },
    };
  }

  if (pathname === "/api/score-history") {
    if (!siteId) return { status: 400, body: { error: "siteId is required" } };
    const limit = Number(searchParams.get("limit") ?? "30");
    return { status: 200, body: await getScoreHistory(client, siteId, limit) };
  }

  if (pathname === "/api/crawl-history") {
    if (!siteId) return { status: 400, body: { error: "siteId is required" } };
    const limit = Number(searchParams.get("limit") ?? "30");
    return { status: 200, body: await getCrawlHistoryWithChangeCounts(client, siteId, limit) };
  }

  if (pathname === "/api/crawl-detail") {
    const crawlRunId = searchParams.get("crawlRunId");
    if (!crawlRunId) return { status: 400, body: { error: "crawlRunId is required" } };
    const crawlRun = await getCrawlRunById(client, crawlRunId);
    if (!crawlRun) return { status: 404, body: { error: "Crawl run not found" } };
    const [previousCrawlRun, changes] = await Promise.all([
      getPreviousCrawlRun(client, crawlRun.site_id, crawlRun.started_at),
      getChangesForCrawlRun(client, crawlRunId),
    ]);
    return { status: 200, body: { crawlRun, previousCrawlRun, sinceLastCrawl: summarizeSinceLastCrawl(changes), changes } };
  }

  if (pathname === "/api/changes") {
    if (!siteId) return { status: 400, body: { error: "siteId is required" } };
    const limit = Number(searchParams.get("limit") ?? "50");
    const eventType = searchParams.get("eventType") ?? undefined;
    const severity = searchParams.get("severity") ?? undefined;
    return { status: 200, body: await getRecentChanges(client, siteId, { limit, eventType, severity }) };
  }

  if (pathname === "/api/resolved-issues") {
    if (!siteId) return { status: 400, body: { error: "siteId is required" } };
    const limit = Number(searchParams.get("limit") ?? "30");
    return { status: 200, body: await getResolvedIssues(client, siteId, limit) };
  }

  if (pathname === "/api/issues") {
    if (!siteId) return { status: 400, body: { error: "siteId is required" } };
    return { status: 200, body: await getCurrentIssues(client, siteId) };
  }

  if (pathname === "/api/issue-detail") {
    const issueKey = searchParams.get("issueKey");
    if (!siteId || !issueKey) return { status: 400, body: { error: "siteId and issueKey are required" } };
    const issue = await getCurrentIssueByKey(client, siteId, issueKey);
    if (!issue) return { status: 404, body: { error: "Issue not found (it may have been resolved)" } };
    return { status: 200, body: issue };
  }

  if (pathname === "/api/pages") {
    if (!siteId) return { status: 400, body: { error: "siteId is required" } };
    const [pages, issues] = await Promise.all([getLatestPages(client, siteId), getCurrentIssues(client, siteId)]);
    const issueCountByUrl = new Map<string, number>();
    for (const issue of issues) {
      issueCountByUrl.set(issue.url, (issueCountByUrl.get(issue.url) ?? 0) + 1);
    }
    const pagesWithIssueCounts = pages.map((page) => ({ ...page, issue_count: issueCountByUrl.get(page.url) ?? 0 }));
    return { status: 200, body: pagesWithIssueCounts };
  }

  if (pathname === "/api/page-detail") {
    const url = searchParams.get("url");
    if (!siteId || !url) return { status: 400, body: { error: "siteId and url are required" } };
    const page = await getLatestPageByUrl(client, siteId, url);
    if (!page) return { status: 404, body: { error: "Page not found in the latest crawl" } };
    const [issues, changes, crawlRun] = await Promise.all([
      getCurrentIssues(client, siteId),
      getChangesForUrl(client, siteId, url),
      getCrawlRunById(client, page.crawl_run_id),
    ]);
    return {
      status: 200,
      body: {
        page,
        issues: issues.filter((i) => i.url === url),
        changes,
        preferredHost: crawlRun?.preferred_host ?? null,
      },
    };
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
      if (req.method === "POST" && url.pathname === "/api/trigger-scan") {
        // Auth is checked before the Supabase-configured gate below, so an
        // unauthorized request never even implicitly confirms Supabase is reachable.
        const auth = checkTriggerAuth(req);
        if (auth !== "ok") {
          sendJson(
            res,
            auth === "not_configured" ? 501 : 401,
            auth === "not_configured"
              ? { error: "Manual scan triggering is not enabled. Set DASHBOARD_ADMIN_TOKEN to enable it." }
              : { error: "Missing or invalid admin token." }
          );
          return;
        }
        if (!isSupabaseConfigured()) {
          sendJson(res, 503, {
            error: "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to use the dashboard.",
          });
          return;
        }
        try {
          const { status, body } = await handleTriggerScan(req);
          sendJson(res, status, body);
        } catch (err) {
          logger.error("Dashboard trigger-scan request failed", err instanceof Error ? err.message : err);
          sendJson(res, 502, { error: "Unable to start a scan right now." });
        }
        return;
      }

      if (!isSupabaseConfigured()) {
        sendJson(res, 503, {
          error: "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to use the dashboard.",
        });
        return;
      }
      try {
        const { status, body } = await handleApi(url.pathname, url.searchParams);
        sendJson(res, status, body);
      } catch (err) {
        logger.error("Dashboard API request failed", err instanceof Error ? err.message : err);
        sendJson(res, 502, { error: "Unable to load data from Supabase." });
      }
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
  logger.info(`SEO Watchdog dashboard listening on http://localhost:${config.dashboardPort}`);
  if (!isSupabaseConfigured()) {
    logger.warn("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set — dashboard API calls will return 503.");
  }
  if (!config.dashboardAdminToken) {
    logger.warn("DASHBOARD_ADMIN_TOKEN is not set — manual scan triggering is disabled.");
  }
});

function shutdown(): void {
  killActiveChild();
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
