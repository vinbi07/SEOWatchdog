import { describe, expect, it, vi } from "vitest";
import { createRunningCrawlRun, updateCrawlRunProgress } from "./seoRepository.js";

/**
 * Minimal fake of the Supabase query-builder chain used by these two
 * functions: .from(table).insert(row).select(cols).single() and
 * .from(table).update(patch).eq(col, val). Captures the arguments passed at
 * each step so tests can assert on the exact payload sent to Supabase.
 */
function fakeClient(opts: { insertResult?: unknown; insertError?: unknown; updateError?: unknown }) {
  const calls: { insert?: unknown; update?: unknown; eq?: [string, unknown] } = {};

  const chain = {
    insert: vi.fn((row: unknown) => {
      calls.insert = row;
      return chain;
    }),
    select: vi.fn(() => chain),
    single: vi.fn(async () => ({ data: opts.insertResult, error: opts.insertError ?? null })),
    update: vi.fn((patch: unknown) => {
      calls.update = patch;
      return chain;
    }),
    eq: vi.fn((col: string, val: unknown) => {
      calls.eq = [col, val];
      return Promise.resolve({ error: opts.updateError ?? null });
    }),
  };

  const client = { from: vi.fn(() => chain) };
  return { client: client as never, calls };
}

describe("createRunningCrawlRun", () => {
  it("inserts a running row with the given trigger_type", async () => {
    const { client, calls } = fakeClient({ insertResult: { id: "run-1" } });

    const id = await createRunningCrawlRun(client, "site-1", "2026-01-01T00:00:00.000Z", "manual_dashboard");

    expect(id).toBe("run-1");
    expect(calls.insert).toMatchObject({
      site_id: "site-1",
      started_at: "2026-01-01T00:00:00.000Z",
      status: "running",
      trigger_type: "manual_dashboard",
      current_stage: "initializing",
    });
  });

  it("defaults trigger_type to null when omitted", async () => {
    const { client, calls } = fakeClient({ insertResult: { id: "run-2" } });

    await createRunningCrawlRun(client, "site-1", "2026-01-01T00:00:00.000Z");

    expect(calls.insert).toMatchObject({ trigger_type: null });
  });

  it("throws a descriptive error when the insert fails", async () => {
    const { client } = fakeClient({ insertError: { message: "boom" } });

    await expect(createRunningCrawlRun(client, "site-1", "2026-01-01T00:00:00.000Z")).rejects.toThrow(/boom/);
  });
});

describe("updateCrawlRunProgress", () => {
  it("writes stage and progress counts with a fresh heartbeat timestamp", async () => {
    const { client, calls } = fakeClient({});

    await updateCrawlRunProgress(client, "run-1", { stage: "crawling", pagesDiscovered: 12, pagesCrawled: 5 });

    expect(calls.update).toMatchObject({
      current_stage: "crawling",
      pages_discovered: 12,
      pages_crawled: 5,
    });
    expect((calls.update as { last_progress_at: string }).last_progress_at).toEqual(expect.any(String));
    expect(calls.eq).toEqual(["id", "run-1"]);
  });

  it("omits count fields entirely when not provided", async () => {
    const { client, calls } = fakeClient({});

    await updateCrawlRunProgress(client, "run-1", { stage: "analyzing" });

    expect(calls.update).not.toHaveProperty("pages_discovered");
    expect(calls.update).not.toHaveProperty("pages_crawled");
  });

  it("throws a descriptive error when the update fails", async () => {
    const { client } = fakeClient({ updateError: { message: "connection reset" } });

    await expect(updateCrawlRunProgress(client, "run-1", { stage: "scoring" })).rejects.toThrow(/connection reset/);
  });
});
