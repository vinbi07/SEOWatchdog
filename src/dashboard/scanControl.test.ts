import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "../config/config.js";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

vi.mock("../db/seoRepository.js", () => ({
  markCrawlRunErrored: vi.fn(),
  findOrCreateSite: vi.fn(),
}));

vi.mock("./queries.js", () => ({
  getSiteById: vi.fn(),
}));

const { spawn } = await import("node:child_process");
const repo = await import("../db/seoRepository.js");
const queries = await import("./queries.js");
const { checkTriggerAuth, reconcileStaleRun, triggerScan } = await import("./scanControl.js");

function fakeSpawnedChild() {
  const child = new EventEmitter() as EventEmitter & { stderr: EventEmitter; stdout: EventEmitter; kill: () => void };
  child.stderr = new EventEmitter();
  child.stdout = new EventEmitter();
  child.kill = vi.fn();
  return child;
}

function fakeClientForActiveRun(activeRun: { id: string; started_at: string; last_progress_at: string | null } | null) {
  const client = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: activeRun, error: null })),
              })),
            })),
          })),
        })),
      })),
    })),
  };
  return client as never;
}

describe("checkTriggerAuth", () => {
  beforeEach(() => {
    (config as { dashboardAdminToken: string | undefined }).dashboardAdminToken = undefined;
  });

  it("returns not_configured when no token is set", () => {
    const result = checkTriggerAuth({ headers: {} } as never);
    expect(result).toBe("not_configured");
  });

  it("returns unauthorized when the header is missing or wrong", () => {
    (config as { dashboardAdminToken: string | undefined }).dashboardAdminToken = "secret-token-value";
    expect(checkTriggerAuth({ headers: {} } as never)).toBe("unauthorized");
    expect(checkTriggerAuth({ headers: { "x-dashboard-admin-token": "wrong" } } as never)).toBe("unauthorized");
  });

  it("returns ok when the header matches", () => {
    (config as { dashboardAdminToken: string | undefined }).dashboardAdminToken = "secret-token-value";
    expect(checkTriggerAuth({ headers: { "x-dashboard-admin-token": "secret-token-value" } } as never)).toBe("ok");
  });
});

describe("reconcileStaleRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (config as { seoScanStaleMinutes: number; seoAuditTimeoutMinutes: number }).seoScanStaleMinutes = 15;
    (config as { seoScanStaleMinutes: number; seoAuditTimeoutMinutes: number }).seoAuditTimeoutMinutes = 45;
  });

  it("does nothing when there is no active run", async () => {
    await reconcileStaleRun(fakeClientForActiveRun(null), "site-1");
    expect(repo.markCrawlRunErrored).not.toHaveBeenCalled();
  });

  it("does nothing for a healthy, recently-heartbeating run", async () => {
    const now = new Date().toISOString();
    await reconcileStaleRun(fakeClientForActiveRun({ id: "run-1", started_at: now, last_progress_at: now }), "site-1");
    expect(repo.markCrawlRunErrored).not.toHaveBeenCalled();
  });

  it("marks a run failed when its heartbeat is stale", async () => {
    const started = new Date(Date.now() - 20 * 60_000).toISOString();
    const staleHeartbeat = new Date(Date.now() - 20 * 60_000).toISOString();
    await reconcileStaleRun(fakeClientForActiveRun({ id: "run-1", started_at: started, last_progress_at: staleHeartbeat }), "site-1");
    expect(repo.markCrawlRunErrored).toHaveBeenCalledWith(expect.anything(), "run-1", "failed", expect.any(String));
  });

  it("marks a run failed when it exceeds the hard timeout even with a recent heartbeat", async () => {
    const started = new Date(Date.now() - 50 * 60_000).toISOString();
    const recentHeartbeat = new Date().toISOString();
    await reconcileStaleRun(fakeClientForActiveRun({ id: "run-1", started_at: started, last_progress_at: recentHeartbeat }), "site-1");
    expect(repo.markCrawlRunErrored).toHaveBeenCalledWith(expect.anything(), "run-1", "failed", expect.any(String));
  });
});

describe("triggerScan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (config as { seoScanStaleMinutes: number; seoAuditTimeoutMinutes: number; seoManualScanCooldownSeconds: number }).seoScanStaleMinutes = 15;
    (config as { seoAuditTimeoutMinutes: number }).seoAuditTimeoutMinutes = 45;
    (config as { seoManualScanCooldownSeconds: number }).seoManualScanCooldownSeconds = 0;
    vi.mocked(queries.getSiteById).mockResolvedValue({
      id: "site-1",
      name: "example.com",
      domain: "example.com",
      baseUrl: "https://example.com",
      lastSuccessfulCrawlAt: null,
    });
  });

  function fakeClientForNewRun() {
    let call = 0;
    return {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => {
                    call += 1;
                    // No active run pre-spawn (calls 1-2 from reconcile+check);
                    // a fresh running row appears once we "poll" post-spawn.
                    if (call <= 2) return { data: null, error: null };
                    return { data: { id: "run-new", started_at: new Date().toISOString(), last_progress_at: null }, error: null };
                  }),
                })),
              })),
            })),
          })),
        })),
      })),
    } as never;
  }

  it("returns already_running without spawning when an active run exists", async () => {
    const client = fakeClientForActiveRun({ id: "run-active", started_at: new Date().toISOString(), last_progress_at: new Date().toISOString() });
    const result = await triggerScan(client, { siteId: "site-1" });
    expect(result).toEqual({ ok: false, reason: "already_running", activeCrawlRunId: "run-active" });
    expect(spawn).not.toHaveBeenCalled();
  });

  it("returns site_not_found without spawning when the siteId doesn't resolve", async () => {
    vi.mocked(queries.getSiteById).mockResolvedValue(null);
    const client = fakeClientForActiveRun(null);
    const result = await triggerScan(client, { siteId: "missing-site" });
    expect(result).toEqual({ ok: false, reason: "site_not_found" });
    expect(spawn).not.toHaveBeenCalled();
  });

  it("spawns npm run audit with the resolved site URL and manual_dashboard trigger type on the happy path", async () => {
    const child = fakeSpawnedChild();
    vi.mocked(spawn).mockReturnValue(child as never);

    const result = await triggerScan(fakeClientForNewRun(), { siteId: "site-1" });

    expect(spawn).toHaveBeenCalledWith(
      expect.any(String),
      ["run", "audit"],
      expect.objectContaining({
        env: expect.objectContaining({ SITE_URL: "https://example.com", SEO_TRIGGER_TYPE: "manual_dashboard", PERSIST_RESULTS: "true" }),
      })
    );
    expect(result).toEqual({ ok: true, siteId: "site-1", crawlRunId: "run-new" });
  });

  it("returns invalid_url without touching the database when the siteUrl is malformed", async () => {
    const client = fakeClientForActiveRun(null);
    const result = await triggerScan(client, { siteUrl: "not-a-url" });
    expect(result).toEqual({ ok: false, reason: "invalid_url" });
    expect(repo.findOrCreateSite).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  });

  it("get-or-creates the site for a valid siteUrl and spawns against it (new site)", async () => {
    vi.mocked(repo.findOrCreateSite).mockResolvedValue({ id: "site-new", domain: "new-example.com", baseUrl: "https://new-example.com" });
    const child = fakeSpawnedChild();
    vi.mocked(spawn).mockReturnValue(child as never);

    const result = await triggerScan(fakeClientForNewRun(), { siteUrl: "https://new-example.com" });

    expect(repo.findOrCreateSite).toHaveBeenCalledWith(expect.anything(), "https://new-example.com");
    expect(spawn).toHaveBeenCalledWith(
      expect.any(String),
      ["run", "audit"],
      expect.objectContaining({ env: expect.objectContaining({ SITE_URL: "https://new-example.com" }) })
    );
    expect(result).toEqual({ ok: true, siteId: "site-new", crawlRunId: "run-new" });
  });

  it("reuses the existing site when siteUrl matches an already-tracked domain", async () => {
    // findOrCreateSite itself owns the dedup-by-domain behavior -- this test
    // just confirms triggerScan doesn't bypass it and uses whatever it returns.
    vi.mocked(repo.findOrCreateSite).mockResolvedValue({ id: "site-1", domain: "example.com", baseUrl: "https://example.com" });
    const child = fakeSpawnedChild();
    vi.mocked(spawn).mockReturnValue(child as never);

    const result = await triggerScan(fakeClientForNewRun(), { siteUrl: "https://example.com/" });

    expect(repo.findOrCreateSite).toHaveBeenCalledWith(expect.anything(), "https://example.com/");
    expect(result).toEqual({ ok: true, siteId: "site-1", crawlRunId: "run-new" });
  });
});
