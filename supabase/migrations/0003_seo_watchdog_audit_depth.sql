-- SEO Watchdog: Step 2.6 audit depth expansion.
--
-- Purely additive: only adds new nullable/defaulted columns to the existing
-- seo_crawl_runs and seo_page_snapshots tables. No column is renamed or
-- dropped, no existing migration is touched, and no existing row's data
-- changes shape (old rows simply read back with NULL/default values for
-- these new columns — the application treats that as "not recorded", never
-- backfilling a guess; see README "Historical Compatibility").

-- 1. Host canonicalization (crawl-level, one check per crawl) -------------

alter table public.seo_crawl_runs
  add column if not exists preferred_host text,
  add column if not exists www_redirect_status integer;

-- 2. Page-level audit depth fields -----------------------------------------

alter table public.seo_page_snapshots
  add column if not exists html_size_bytes integer,
  add column if not exists charset text,
  add column if not exists has_html5_doctype boolean,
  add column if not exists compression_encoding text,

  add column if not exists internal_link_count integer,
  add column if not exists unique_internal_link_count integer,
  add column if not exists external_link_count integer,
  add column if not exists unique_external_link_count integer,

  add column if not exists title_pixel_width_estimate integer,
  add column if not exists meta_description_pixel_width_estimate integer,

  add column if not exists mixed_content_count integer,

  add column if not exists alternate_links jsonb not null default '[]'::jsonb,
  add column if not exists headings jsonb not null default '[]'::jsonb,
  add column if not exists anchor_metrics jsonb not null default '{}'::jsonb,
  add column if not exists server_headers jsonb not null default '{}'::jsonb,
  add column if not exists duplicate_content_samples jsonb not null default '[]'::jsonb;
