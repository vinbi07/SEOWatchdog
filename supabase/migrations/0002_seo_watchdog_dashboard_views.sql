-- SEO Watchdog: Step 2.5 dashboard read views.
--
-- Purely additive: only creates new views on top of the existing seo_*
-- tables from 0001_seo_watchdog_core_schema.sql. Nothing here alters,
-- renames, or drops any existing table, column, index, or policy. Views run
-- with the querying role's own permissions (Postgres default), so they
-- inherit the same RLS behavior as the tables they select from.
--
-- These views exist to let the dashboard answer "first seen / last seen /
-- how many crawls has this issue been open for" and "current issues with
-- history" in a single indexed query instead of one query per row (see
-- src/dashboard/queries.ts).

-- Most recent crawl run per site.
create or replace view public.seo_latest_crawl_runs as
select distinct on (site_id) *
from public.seo_crawl_runs
order by site_id, started_at desc;

-- Every issue snapshot, with the timestamp of the crawl it belongs to.
create or replace view public.seo_issue_occurrences as
select
  s.id as issue_snapshot_id,
  s.site_id,
  s.issue_key,
  s.crawl_run_id,
  c.started_at as crawl_started_at
from public.seo_issue_snapshots s
join public.seo_crawl_runs c on c.id = s.crawl_run_id;

-- Per (site, issue_key) history: when an issue with this identity was first
-- and most recently seen, and how many crawls it has appeared in. Read-only
-- aggregation; never mutates seo_issue_snapshots.
create or replace view public.seo_issue_history as
select
  site_id,
  issue_key,
  min(crawl_started_at) as first_seen_at,
  max(crawl_started_at) as last_seen_at,
  count(*) as times_seen
from public.seo_issue_occurrences
group by site_id, issue_key;

-- Issues belonging to each site's latest crawl, enriched with first-seen /
-- times-seen history and the owning page's page_type (issue snapshots don't
-- carry page_type themselves). This is what the dashboard's "Current
-- Issues" and "Issue Detail" views read from, in one query instead of N+1.
create or replace view public.seo_current_issues as
select
  i.*,
  h.first_seen_at,
  h.times_seen,
  p.page_type
from public.seo_issue_snapshots i
join public.seo_latest_crawl_runs lc on lc.id = i.crawl_run_id
left join public.seo_issue_history h on h.site_id = i.site_id and h.issue_key = i.issue_key
left join public.seo_page_snapshots p on p.id = i.page_snapshot_id;

-- Page snapshots belonging to each site's latest crawl. Used by the Pages
-- table and Page Detail view.
create or replace view public.seo_latest_pages as
select p.*
from public.seo_page_snapshots p
join public.seo_latest_crawl_runs lc on lc.id = p.crawl_run_id;
