-- SEO Watchdog: Step 3 manual scan control.
--
-- Purely additive: adds nullable columns to the existing seo_crawl_runs
-- table only. Nothing in this migration alters, renames, or drops any
-- existing object, and no old migration is touched. Follows the same
-- "seo_" namespacing convention as 0001-0004 (see 0001 for the rationale).
--
-- trigger_type records how a crawl run was started. It is nullable with no
-- default: crawl runs that predate this feature simply have no value here,
-- and the dashboard displays that as "Legacy / Unknown" rather than
-- guessing/defaulting to a value that may not be true.
--
-- current_stage / pages_discovered / pages_crawled / last_progress_at are a
-- best-effort progress heartbeat written during a run (see
-- src/db/seoRepository.ts's updateCrawlRunProgress) so the dashboard can
-- show live scan state. current_stage is intentionally free text rather
-- than a check-constrained enum -- the set of stages lives in application
-- code (CrawlStage in seoRepository.ts), matching this project's existing
-- style for other volatile vocab like page_type/issue_type.
--
-- last_progress_at is also the basis for stale-run recovery: a run whose
-- status is still 'running' but whose last_progress_at is far in the past
-- is considered dead and eligible to be marked failed so a new scan can
-- start. No separate lock table is introduced -- a second table tracking
-- "is this run alive" would just be another place that fact could disagree
-- with seo_crawl_runs itself.

alter table public.seo_crawl_runs
  add column if not exists trigger_type text check (trigger_type in ('manual_cli', 'manual_dashboard', 'system')),
  add column if not exists current_stage text,
  add column if not exists pages_discovered integer,
  add column if not exists pages_crawled integer,
  add column if not exists last_progress_at timestamptz;
