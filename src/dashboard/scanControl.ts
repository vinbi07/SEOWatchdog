/**
 * Manual scan trigger control: authorization, cooldown/duplicate-run
 * guards, stale/timeout recovery, and spawning the audit pipeline as a
 * child process (the exact same entrypoint `npm run audit` uses).
 *
 * State here (lastManualTriggerAt, activeChild) is in-memory and scoped to
 * this single dashboard server process — this tool has no multi-instance
 * deployment story today. The real cross-instance source of truth is the
 * `seo_crawl_runs.status = 'running'` row itself, which every check here
 * ultimately falls back to.
 */
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { IncomingMessage } from "node:http";
import { config } from "../config/config.js";
import { findOrCreateSite, markCrawlRunErrored } from "../db/seoRepository.js";
import { logger } from "../utils/logger.js";
import { getSiteById } from "./queries.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../../");

const ADMIN_TOKEN_HEADER = "x-dashboard-admin-token";

export type TriggerAuthResult = "ok" | "not_configured" | "unauthorized";

export function checkTriggerAuth(req: IncomingMessage): TriggerAuthResult {
  if (!config.dashboardAdminToken) return "not_configured";
  const header = req.headers[ADMIN_TOKEN_HEADER];
  const token = Array.isArray(header) ? header[0] : header;
  if (!token || token !== config.dashboardAdminToken) return "unauthorized";
  return "ok";
}

interface ActiveRunRow {
  id: string;
  started_at: string;
  last_progress_at: string | null;
}

async function getActiveRun(client: SupabaseClient, siteId: string): Promise<ActiveRunRow | null> {
  const { data, error } = await client
    .from("seo_crawl_runs")
    .select("id, started_at, last_progress_at")
    .eq("site_id", siteId)
    .eq("status", "running")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * If the site's active run is stale (no heartbeat within
 * SEO_SCAN_STALE_MINUTES) or has exceeded the hard SEO_AUDIT_TIMEOUT_MINUTES
 * ceiling, marks it failed so a new scan can start. Safe to call on every
 * trigger attempt and every /api/latest-crawl poll — a no-op when the run
 * is healthy or there is none.
 */
export async function reconcileStaleRun(client: SupabaseClient, siteId: string): Promise<void> {
  const run = await getActiveRun(client, siteId);
  if (!run) return;

  const now = Date.now();
  const startedAtMs = new Date(run.started_at).getTime();
  const lastProgressMs = new Date(run.last_progress_at ?? run.started_at).getTime();

  const staleMs = config.seoScanStaleMinutes * 60_000;
  const timeoutMs = config.seoAuditTimeoutMinutes * 60_000;

  const isStale = now - lastProgressMs > staleMs;
  const isTimedOut = now - startedAtMs > timeoutMs;

  if (!isStale && !isTimedOut) return;

  const reason = isTimedOut
    ? `Scan marked failed: exceeded the ${config.seoAuditTimeoutMinutes}-minute timeout.`
    : `Scan marked failed: no progress for over ${config.seoScanStaleMinutes} minutes.`;

  logger.warn(`Reconciling stale/timed-out crawl run ${run.id} for site ${siteId}: ${reason}`);
  await markCrawlRunErrored(client, run.id, "failed", reason);
}

export type ScanTarget = { siteId: string } | { siteUrl: string };

export type TriggerScanResult =
  | { ok: true; siteId: string; crawlRunId: string | null }
  | { ok: false; reason: "already_running"; activeCrawlRunId: string }
  | { ok: false; reason: "cooldown"; retryAfterSeconds: number }
  | { ok: false; reason: "site_not_found" }
  | { ok: false; reason: "invalid_url" };

let lastManualTriggerAt: number | null = null;
let activeChild: ChildProcess | null = null;

function cooldownRemainingSeconds(): number {
  if (lastManualTriggerAt === null) return 0;
  const elapsedSeconds = (Date.now() - lastManualTriggerAt) / 1000;
  const remaining = config.seoManualScanCooldownSeconds - elapsedSeconds;
  return remaining > 0 ? Math.ceil(remaining) : 0;
}

/** Waits briefly for the spawned process's crawl-run row to appear, without holding the HTTP request open for the whole crawl. */
async function pollForNewRunId(client: SupabaseClient, siteId: string, notStartedBefore: number): Promise<string | null> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const run = await getActiveRun(client, siteId);
    if (run && new Date(run.started_at).getTime() >= notStartedBefore) return run.id;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return null;
}

/**
 * Resolves a scan target to a concrete { id, baseUrl } site row. A siteUrl
 * target is get-or-created via findOrCreateSite -- the same dedup-by-domain
 * function the spawned CLI process itself calls, so typing an already-
 * tracked site's URL again reuses that site rather than creating a
 * duplicate. Returns null on an invalid URL or an unknown siteId.
 */
async function resolveScanTarget(
  client: SupabaseClient,
  target: ScanTarget
): Promise<{ id: string; baseUrl: string } | "invalid_url" | "site_not_found"> {
  if ("siteUrl" in target) {
    try {
      new URL(target.siteUrl);
    } catch {
      return "invalid_url";
    }
    const site = await findOrCreateSite(client, target.siteUrl);
    return { id: site.id, baseUrl: site.baseUrl };
  }

  const site = await getSiteById(client, target.siteId);
  if (!site) return "site_not_found";
  return { id: site.id, baseUrl: site.baseUrl };
}

export async function triggerScan(client: SupabaseClient, target: ScanTarget): Promise<TriggerScanResult> {
  const resolved = await resolveScanTarget(client, target);
  if (resolved === "invalid_url" || resolved === "site_not_found") {
    return { ok: false, reason: resolved };
  }
  const { id: siteId, baseUrl } = resolved;

  await reconcileStaleRun(client, siteId);

  const cooldownRemaining = cooldownRemainingSeconds();
  if (cooldownRemaining > 0) {
    return { ok: false, reason: "cooldown", retryAfterSeconds: cooldownRemaining };
  }

  const activeRun = await getActiveRun(client, siteId);
  if (activeRun) {
    return { ok: false, reason: "already_running", activeCrawlRunId: activeRun.id };
  }

  lastManualTriggerAt = Date.now();
  const spawnedAt = lastManualTriggerAt;

  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const child = spawn(npmCommand, ["run", "audit"], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      SITE_URL: baseUrl,
      SEO_TRIGGER_TYPE: "manual_dashboard",
      PERSIST_RESULTS: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
  });
  activeChild = child;

  let stderrTail = "";
  child.stderr?.on("data", (chunk: Buffer) => {
    stderrTail = (stderrTail + chunk.toString()).slice(-4000);
  });

  child.on("exit", (code) => {
    if (activeChild === child) activeChild = null;
    if (code !== 0) {
      logger.error(`Dashboard-triggered audit process exited with code ${code}.`, stderrTail || undefined);
      // Safety net for crashes the pipeline's own error handling couldn't
      // self-report (OOM, uncaught exception, SIGKILL) -- if the run row is
      // still 'running', mark it failed rather than leaving it stuck.
      void (async () => {
        const stillActive = await getActiveRun(client, siteId).catch(() => null);
        if (stillActive) {
          await markCrawlRunErrored(client, stillActive.id, "failed", "Scan process exited unexpectedly.").catch((err) => {
            logger.error("Failed to mark crashed crawl run as failed.", err);
          });
        }
      })();
    }
  });

  child.on("error", (err) => {
    logger.error("Failed to spawn dashboard-triggered audit process.", err);
    if (activeChild === child) activeChild = null;
  });

  const crawlRunId = await pollForNewRunId(client, siteId, spawnedAt);
  return { ok: true, siteId, crawlRunId };
}

export function killActiveChild(): void {
  if (activeChild) {
    activeChild.kill();
    activeChild = null;
  }
}
