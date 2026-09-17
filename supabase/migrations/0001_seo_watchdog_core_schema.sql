-- SEO Watchdog: Step 2 persistence schema.
--
-- This project's own repo had no prior `supabase/migrations` folder, but the
-- Supabase project it connects to is shared with an unrelated internal app
-- (existing tables include: scorecard, rocks, issues, todos, issue_comments,
-- agenda_items, meeting_links, conclude_items, meetings, meeting_snapshots,
-- decisions, parking_lot, saved_views, notification_events,
-- calendar_sync_events, people, meeting_format_segments, shopify_targets,
-- tasks, task_audit_log, task_details, task_subtasks, task_labels,
-- task_label_assignments, task_comments, task_attachments, task_links,
-- sales_reps, sales_week_entries, sales_rep_week_goals, member_kpis,
-- kpi_history).
--
-- To avoid any collision with that schema (note "issues" and "tasks" already
-- exist there with a different shape), every SEO Watchdog table below is
-- namespaced with an `seo_` prefix. Nothing in this migration touches,
-- renames, or drops any pre-existing object. This migration is purely
-- additive.
--
-- RLS policies follow the same permissive "for all using (true)" convention
-- already used throughout the rest of this Supabase project (no auth layer
-- exists there today), scoped only to these five new tables. Regardless of
-- RLS, the service role key used to write these tables is never sent to a
-- browser; the read-only dashboard proxies reads through a small local
-- server (see src/dashboard/server.ts) rather than querying Supabase
-- directly from client-side JS.

-- 1. Sites -------------------------------------------------------------

create table if not exists public.seo_sites (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  domain text not null,
  base_url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_successful_crawl_at timestamptz,
  unique (domain)
);

-- 2. Crawl runs ----------------------------------------------------------

create table if not exists public.seo_crawl_runs (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.seo_sites(id) on delete cascade,

  started_at timestamptz not null,
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'success', 'partial', 'failed')),

  total_pages integer not null default 0,

  critical_count integer not null default 0,
  high_count integer not null default 0,
  medium_count integer not null default 0,
  low_count integer not null default 0,

  sitemap_urls integer not null default 0,
  internally_discovered_urls integer not null default 0,
  discovered_not_in_sitemap integer not null default 0,
  indexable_missing_from_sitemap integer not null default 0,
  non_indexable_missing_from_sitemap integer not null default 0,
  orphaned_sitemap_pages integer not null default 0,

  indexable_count integer not null default 0,
  noindex_expected_count integer not null default 0,
  noindex_review_count integer not null default 0,
  noindex_unexpected_count integer not null default 0,

  crawler_version text,
  error_message text,

  created_at timestamptz not null default now()
);

-- 3. Page snapshots (immutable per crawl run) -----------------------------

create table if not exists public.seo_page_snapshots (
  id uuid primary key default gen_random_uuid(),
  crawl_run_id uuid not null references public.seo_crawl_runs(id) on delete cascade,
  site_id uuid not null references public.seo_sites(id) on delete cascade,

  url text not null,
  normalized_url text not null,
  final_url text,

  status_code integer,
  redirect_count integer not null default 0,
  response_time_ms integer,

  page_type text not null default 'unknown',

  publication_state text not null default 'unknown',
  indexing_state text not null default 'indexable',
  is_indexable boolean not null default true,

  title text,
  title_length integer not null default 0,
  meta_description text,
  meta_description_length integer not null default 0,
  canonical text,

  h1_count integer not null default 0,
  h2_count integer not null default 0,
  word_count integer not null default 0,

  internal_inbound_link_count integer not null default 0,
  internal_outbound_link_count integer not null default 0,

  image_count integer not null default 0,
  images_missing_alt integer not null default 0,

  noindex boolean not null default false,
  nofollow boolean not null default false,

  lang text,
  has_viewport boolean not null default false,
  has_favicon boolean not null default false,

  source_sitemap boolean not null default false,
  source_discovered boolean not null default false,

  structured_data jsonb not null default '[]'::jsonb,
  structured_data_details jsonb not null default '[]'::jsonb,
  open_graph jsonb not null default '{}'::jsonb,
  twitter jsonb not null default '{}'::jsonb,
  robots_meta jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

-- 4. Issue snapshots -------------------------------------------------------

create table if not exists public.seo_issue_snapshots (
  id uuid primary key default gen_random_uuid(),
  crawl_run_id uuid not null references public.seo_crawl_runs(id) on delete cascade,
  site_id uuid not null references public.seo_sites(id) on delete cascade,
  page_snapshot_id uuid references public.seo_page_snapshots(id) on delete cascade,

  url text not null,
  issue_key text not null,
  issue_type text not null,
  severity text not null check (severity in ('critical', 'high', 'medium', 'low')),
  message text not null,
  recommendation text not null default '',
  value jsonb,

  created_at timestamptz not null default now()
);

-- 5. Change events -----------------------------------------------------

create table if not exists public.seo_change_events (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.seo_sites(id) on delete cascade,
  crawl_run_id uuid not null references public.seo_crawl_runs(id) on delete cascade,
  previous_crawl_run_id uuid references public.seo_crawl_runs(id) on delete set null,

  event_type text not null,
  entity_type text not null check (entity_type in ('issue', 'page', 'site')),

  url text,
  issue_key text,
  severity text,
  field_name text,

  previous_value jsonb,
  current_value jsonb,

  message text not null,
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

-- Indexes ------------------------------------------------------------------

create index if not exists seo_sites_domain_idx on public.seo_sites(domain);

create index if not exists seo_crawl_runs_site_started_idx on public.seo_crawl_runs(site_id, started_at desc);
create index if not exists seo_crawl_runs_site_status_idx on public.seo_crawl_runs(site_id, status);

create index if not exists seo_page_snapshots_crawl_run_idx on public.seo_page_snapshots(crawl_run_id);
create index if not exists seo_page_snapshots_normalized_url_idx on public.seo_page_snapshots(site_id, normalized_url);

create index if not exists seo_issue_snapshots_crawl_run_idx on public.seo_issue_snapshots(crawl_run_id);
create index if not exists seo_issue_snapshots_issue_key_idx on public.seo_issue_snapshots(site_id, issue_key);

create index if not exists seo_change_events_crawl_run_idx on public.seo_change_events(crawl_run_id);
create index if not exists seo_change_events_site_created_idx on public.seo_change_events(site_id, created_at desc);
create index if not exists seo_change_events_event_type_idx on public.seo_change_events(event_type);

-- Realtime + RLS -------------------------------------------------------

do $$
begin
  alter publication supabase_realtime add table public.seo_sites;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.seo_crawl_runs;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.seo_change_events;
exception
  when duplicate_object then null;
end $$;

alter table public.seo_sites enable row level security;
alter table public.seo_crawl_runs enable row level security;
alter table public.seo_page_snapshots enable row level security;
alter table public.seo_issue_snapshots enable row level security;
alter table public.seo_change_events enable row level security;

create policy "seo_sites all" on public.seo_sites for all using (true) with check (true);
create policy "seo_crawl_runs all" on public.seo_crawl_runs for all using (true) with check (true);
create policy "seo_page_snapshots all" on public.seo_page_snapshots for all using (true) with check (true);
create policy "seo_issue_snapshots all" on public.seo_issue_snapshots for all using (true) with check (true);
create policy "seo_change_events all" on public.seo_change_events for all using (true) with check (true);
