-- SEO Watchdog: Step 2.7 overall SEO score persistence.
--
-- Purely additive: adds one new table (plus a supporting view) on top of the
-- existing seo_crawl_runs / seo_sites tables. Nothing in this migration
-- alters, renames, or drops any existing object, and no old migration is
-- touched. Follows the same "seo_" namespacing and permissive RLS
-- convention as 0001/0002/0003 (see 0001 for the rationale).
--
-- One score snapshot is written per successfully persisted crawl run (see
-- src/persistence/persistCrawl.ts). Crawl runs that predate this feature, or
-- that failed before reaching the scoring step, simply have no matching row
-- here — the dashboard and backfill script both treat that as "not
-- calculated for this crawl", never as an error, and never invent a score.

create table if not exists public.seo_score_snapshots (
  id uuid primary key default gen_random_uuid(),
  crawl_run_id uuid not null references public.seo_crawl_runs(id) on delete cascade,
  site_id uuid not null references public.seo_sites(id) on delete cascade,

  overall_score integer not null,
  overall_score_raw numeric not null,

  technical_score integer not null,
  on_page_score integer not null,
  content_score integer not null,
  internal_linking_score integer not null,
  indexing_score integer not null,
  performance_score integer not null,

  safety_cap_applied text,
  score_breakdown jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),

  unique (crawl_run_id)
);

create index if not exists seo_score_snapshots_crawl_run_idx on public.seo_score_snapshots(crawl_run_id);
create index if not exists seo_score_snapshots_site_created_idx on public.seo_score_snapshots(site_id, created_at desc);

alter table public.seo_score_snapshots enable row level security;
create policy "seo_score_snapshots all" on public.seo_score_snapshots for all using (true) with check (true);

-- Most recent score per site, scoped to successful crawl runs only —
-- mirrors seo_latest_crawl_runs' pattern (0002_seo_watchdog_dashboard_views.sql).
create or replace view public.seo_latest_score_snapshots as
select distinct on (s.site_id) s.*
from public.seo_score_snapshots s
join public.seo_crawl_runs r on r.id = s.crawl_run_id
where r.status = 'success'
order by s.site_id, r.started_at desc;
