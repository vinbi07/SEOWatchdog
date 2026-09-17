# SEO Watchdog

SEO Watchdog is a deterministic, rule-based technical and on-page SEO monitoring
tool. It crawls a website's sitemap, analyzes each page for a fixed set of
technical/on-page SEO signals, applies a rules engine to flag issues by
severity, and writes a structured JSON report plus a console summary.

This was the first version of an eventual continuous monitoring system. Step
2 adds the "what changed since the last crawl?" answer: optional Supabase
persistence of every crawl, deterministic historical comparison against the
previous successful crawl, and a minimal read-only dashboard (see section 9).
No AI/LLM analysis, scheduled crawls, or external integrations (Search
Console, PageSpeed) yet — those are still planned (section 8).

## 1. What it does

1. Discovers the site's sitemap(s) via `robots.txt` and common well-known
   paths (`/sitemap.xml`, `/sitemap_index.xml`), following sitemap indexes.
2. Crawls every URL found in the sitemap (deduped, same-domain only, with
   configurable concurrency and rate limiting).
3. Parses each page's HTML with Cheerio and extracts technical/on-page SEO
   signals (titles, meta tags, headings, links, images, structured data,
   social metadata, etc.) — HTML is treated as untrusted input and is never
   executed.
4. **Discovers additional internal pages** by following the internal links
   found on crawled pages (breadth-first, depth- and count-limited) and
   crawls any that look like real HTML pages and aren't already known from
   the sitemap.
5. **Classifies every crawled page** into a `pageType` (homepage, episode,
   episodes index, booking, service, generic, ...) using a modular,
   pattern-based classifier.
6. Applies a deterministic, **page-type-aware** rules engine (per-page
   rules + cross-page duplicate detection + sitemap-coverage comparison) to
   produce a list of severity-tagged issues.
7. **Classifies each noindex page's indexing state** (indexable, expected
   noindex, needs review, or unexpectedly noindex) using publication-state
   evidence from structured data, instead of treating every `noindex` page
   as an error.
8. Writes `output/latest-crawl.json` and prints a human-readable console
   summary, including sitemap coverage and indexing-state breakdowns.

## 2. Installation

```bash
npm install
cp .env.example .env
# edit .env if needed
```

Requires Node.js 18+ (tested on Node 24).

## 3. Environment variables

All configuration lives in `.env` (see `.env.example`).

| Variable            | Required | Default                | Description                                              |
| ------------------- | -------- | ----------------------- | ---------------------------------------------------------|
| `SITE_URL`           | yes      | —                       | The site to audit, e.g. `https://thesickestpodcast.com`  |
| `MAX_CONCURRENCY`    | no       | `5`                     | Max number of pages crawled in parallel                  |
| `REQUEST_TIMEOUT`    | no       | `10000`                 | Per-request timeout in ms                                |
| `REQUEST_DELAY_MS`   | no       | `250`                   | Delay between requests per worker, to avoid hammering    |
| `USER_AGENT`         | no       | `SEOWatchdogBot/0.1 ...`| User-Agent string sent with every request                |
| `MAX_PAGES`          | no       | `0` (no cap)            | Safety cap on number of sitemap URLs crawled              |
| `DISCOVER_INTERNAL_URLS` | no   | `true`                  | Whether to follow internal links to discover pages beyond the sitemap |
| `MAX_DISCOVERED_PAGES`  | no    | `100`                   | Safety cap on how many *additional* (non-sitemap) pages discovery may crawl |
| `MAX_CRAWL_DEPTH`    | no       | `3`                     | How many link-hops beyond the sitemap seed pages discovery may follow |
| `PERSIST_RESULTS`    | no       | `false`                 | Set to `true` to persist each crawl to Supabase and enable historical comparison |
| `SUPABASE_URL`       | only if persisting | —             | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | only if persisting | —      | Supabase **service role** key. Server-side/CLI use only — see section 9 |
| `DASHBOARD_PORT`     | no       | `4173`                  | Port for the local read-only dashboard server (`npm run dashboard`) |

Environment variables are validated at startup with Zod; the process exits
with a clear error message if `SITE_URL` is missing or invalid. No
environment variables are ever written into the report output.

**Never expose `SUPABASE_SERVICE_ROLE_KEY` in any frontend or browser-loaded
code.** It is read only by the CLI (`npm run audit`) and by the dashboard's
local server process (`npm run dashboard`); the dashboard's browser-side JS
never receives it — it only talks to that local server's own `/api/*`
endpoints.

## 4. Running an audit

```bash
npm run audit
```

This runs `src/index.ts` via `tsx` (no build step required). It will:

- print progress/log lines to stderr/stdout as it crawls,
- print a console summary at the end, including a **"SINCE LAST CRAWL"**
  section (see section 9),
- write the full report to `output/latest-crawl.json`,
- if `PERSIST_RESULTS=true`, persist the crawl to Supabase and compare it
  against the previous successful crawl (see section 9). If Supabase is
  unreachable or misconfigured, the audit still completes and
  `output/latest-crawl.json` is still written — persistence failure never
  blocks or corrupts the local report.

Other scripts:

```bash
npm run build      # type-check and compile to dist/ (optional)
npm test           # run the test suite once
npm run test:watch
npm run dashboard  # start the local read-only dashboard (see section 9)
```

## 5. Report structure

`output/latest-crawl.json`:

```jsonc
{
  "site": "https://thesickestpodcast.com",
  "crawlStartedAt": "2026-09-16T21:49:44.407Z",
  "crawlFinishedAt": "2026-09-16T21:49:47.912Z",
  "totalPages": 15,
  "discovery": {
    "sitemapUrls": 8,
    "internallyDiscoveredUrls": 15,
    "discoveredNotInSitemap": 7,
    "indexableMissingFromSitemap": 0,
    "nonIndexableMissingFromSitemap": 7,
    "orphanedSitemapPages": 1
  },
  "indexing": {
    "indexable": 8,
    "noindexExpected": 0,
    "noindexReview": 7,
    "noindexUnexpected": 0
  },
  "summary": { "critical": 0, "high": 0, "medium": 7, "low": 12 },
  "siteIssues": [],
  "pages": [ /* PageResult[] */ ],

  "comparison": {
    "baseline": false,
    "previousCrawlId": "3f2a...",
    "newIssues": 2,
    "resolvedIssues": 1,
    "ongoingIssues": 16,
    "newPages": 1,
    "removedPages": 0,
    "changedPages": 3
  },
  "changes": [ /* ChangeEvent[], see section 9 */ ],
  "persistence": { "status": "success", "crawlRunId": "9c1e...", "errorMessage": null }
}
```

`comparison`, `changes`, and `persistence` are always present, regardless of
whether `PERSIST_RESULTS` is enabled:

- When persistence is disabled or Supabase is unreachable,
  `persistence.status` is `"skipped"` or `"failed"`, and `comparison` falls
  back to a `baseline: true` shape with all counts at `0` — this is *not* a
  claim that a baseline was actually stored, just a safe default so
  consumers of the JSON don't have to special-case a missing key. Check
  `persistence.status` to know whether the comparison is real.
- When persistence succeeds and no previous successful crawl exists yet,
  `comparison.baseline` is genuinely `true` — this crawl was stored as the
  first data point.
- Otherwise `comparison` reflects a real diff against the previous
  successful crawl, and `changes` lists every generated `ChangeEvent` (see
  section 9 for the full shape and event types).

`discovery` summarizes sitemap coverage: how many URLs came from the
sitemap, how many distinct pages were crawled in total (sitemap +
internally discovered), how many of those discovered pages aren't in the
sitemap at all (`discoveredNotInSitemap`), split into a real gap
(`indexableMissingFromSitemap` — indexable, self-canonical pages the
sitemap should probably list) versus informational-only
(`nonIndexableMissingFromSitemap` — noindex/non-indexable pages, not
treated as an SEO problem), plus how many sitemap pages have no internal
links pointing to them (`orphanedSitemapPages`, indexable pages only).

`indexing` summarizes the indexing-state breakdown across all pages (see
`indexingState` below). `siteIssues` is reserved for future issues that
describe the site as a whole rather than one URL (currently always empty).

Each entry in `pages` includes (see `src/types/seo.ts` for the full type):

- `url`, `finalUrl`, `status`, `redirectCount`, `responseTimeMs`, `outcome`
- `title`, `titleLength`, `metaDescription`, `metaDescriptionLength`,
  `canonical`
- `robotsMeta` (raw directive + parsed `noindex`/`nofollow`), `noindex`
- `h1` (array of H1 texts), `h1Count`, `h2Count`, `wordCount`
- `internalLinks`, `externalLinks`, `brokenInternalLinks`
- `internalInboundLinkCount` / `internalOutboundLinkCount` — how many other
  crawled pages link to this page, and how many internal links it makes
- `images: { total, missingAlt }`
- `openGraph`, `twitter`
- `structuredData` (distinct JSON-LD `@type` values found)
- `structuredDataDetails` — field-level detail for structured-data types we
  read in depth (currently `PodcastEpisode`: `datePublished`,
  `dateModified`, `episodeNumber`, `name`, `url`)
- `lang`, `hasViewport`, `hasFavicon`
- `isIndexable` — the plain technical fact: 2xx status and not `noindex`
- `pageType` — one of `homepage`, `episode`, `episodes_index`, `booking`,
  `service`, `generic`, `unknown` (see `src/pageTypes/`)
- `sources` — `{ sitemap, discovered }`, where each is a boolean for
  whether the page was actually observed via the sitemap, via an internal
  link from some other crawled page, or both (a page can be `true`/`true`)
- `publicationState` — one of `published`, `scheduled`, `draft`, `unknown`;
  derived only from reliable evidence (currently structured-data
  `datePublished`), defaulting to `unknown` rather than guessed
- `indexingState` — one of `indexable`, `noindex_expected`,
  `noindex_review`, `noindex_unexpected`; a nuanced read on `noindex` (see
  "Indexing state" below)
- `issues` (array of `Issue`, see below)

Each `Issue`:

```ts
{
  issueType: string;       // e.g. "missing_title"
  severity: "critical" | "high" | "medium" | "low";
  message: string;
  recommendation: string;
  url: string;
  value?: unknown;         // relevant raw value, when applicable
}
```

## 6. SEO rules

Thresholds live in one place: `src/rules/thresholds.ts`. Rules are
implemented in `src/rules/rules.ts` (per-page, page-type-aware),
`src/rules/duplicateRules.ts` (cross-page duplicate detection),
`src/rules/coverageRules.ts` (sitemap-vs-internal-link-graph coverage),
and `src/indexing/analyzeIndexingState.ts` (noindex/publication-state
reasoning). These are **internal monitoring heuristics**, not absolute
Google ranking rules — messaging is written to reflect that (e.g. a long
title "may be truncated," not "violates a limit").

**Critical**
- Page cannot be crawled (network error, timeout, redirect loop)
- Page returns a 5xx response

**High**
- Page returns a 4xx response
- Missing `<title>`
- Duplicate title across multiple indexable pages
- Missing canonical tag
- Canonical points to an unexpected external domain
- Sitemap URL redirects to a different final URL (`sitemap_url_redirect`)
- `sitemap_url_noindex` — a URL that's in the sitemap (i.e. "please index
  this") but marked `noindex`; a sitemap is a claim about what should be
  indexed, so this always matters regardless of publication state
- `unexpected_noindex` — a page whose publication state indicates it's
  published (currently: episode pages with a past `datePublished`) but is
  marked `noindex` anyway

**Medium**
- Missing meta description
- Missing H1
- Title longer than ~60 characters / shorter than ~20 characters (severity
  is "medium" for page types where titles matter most — homepage,
  episode, episodes index — and "low" for others)
- Meta description longer than ~160 characters
- Duplicate meta description across indexable pages
- Multiple H1 elements
- Broken internal links (detected within the crawled set)
- `indexable_page_missing_from_sitemap` — an indexable, self-canonical
  page that's linked from the site but absent from the XML sitemap (a
  noindex/non-indexable page missing from the sitemap is *not* flagged —
  see `nonIndexableMissingFromSitemap` in the discovery summary instead)
- `orphaned_sitemap_page` — an **indexable** sitemap URL with no internal
  links from any other crawled page (a diagnostic signal, not proof of a
  real problem — e.g. a legitimate landing/campaign page; intentionally
  noindexed sitemap pages are excluded from this check)
- `missing_podcast_episode_schema` — an `episode`-type page with no
  `PodcastEpisode` JSON-LD (never required on other page types)

**Low**
- Images missing `alt` attributes
- Missing Open Graph metadata
- Missing Twitter card metadata
- Missing `lang` attribute
- Missing favicon
- Unusually low word count — threshold depends on `pageType`
  (`src/rules/thresholds.ts`): homepage is never flagged; episode pages
  warn under 75 words; episodes index / booking under 100; service /
  generic under 150.
- `noindex_requires_review` — a noindex page whose publication state
  couldn't be determined (see "Indexing state" below); kept low-severity
  and informational on purpose, to avoid flooding the report with noise
  for content that's very likely intentionally unpublished

### Indexing state

Not every `noindex` page is a bug — an unreleased episode is supposed to
be noindex. `src/indexing/analyzeIndexingState.ts` (with
`src/indexing/indexingRules.ts` and `src/indexing/publicationState.ts`)
turns the raw `noindex` boolean into one of four states per page:

- **`indexable`** — not noindex.
- **`noindex_unexpected`** — either the URL is in the sitemap (a sitemap
  entry is itself a claim the URL should be indexed), or a site-specific
  rule says this page type/publication-state combination should be
  indexable (e.g. a published episode). Generates a high-severity issue.
- **`noindex_expected`** — a site-specific rule says noindex is fine for
  this page type/publication-state combination (e.g. a draft or scheduled
  episode), or the page type has no indexing rule configured at all (most
  page types default to "assume intentional," since we have no framework
  to judge otherwise). No issue generated.
- **`noindex_review`** — a site-specific rule exists for this page type,
  but the publication state is `unknown`, so we genuinely can't tell.
  Generates a low-severity `noindex_requires_review` issue rather than
  staying silent or guessing.

Publication state (`publicationState`) is read only from reliable
evidence — currently `datePublished` in `PodcastEpisode` JSON-LD, compared
against the current time. No evidence means `unknown`; it is never
inferred from `noindex` itself or from whether the page is linked.

Per-site expectations live in `src/indexing/indexingRules.ts` as a plain
`{ pageType: { allowNoindexWhenPublicationState, requireIndexableWhenPublicationState } }`
map — for thesickestpodcast.com, only `episode` has a rule (`published`
requires indexable; `scheduled`/`draft` allow noindex; `unknown` falls
through to `noindex_review`). Other sites can supply a different map
without touching the analysis logic.

### Page-type classification

`src/pageTypes/classifyPage.ts` + `src/pageTypes/pageTypeRules.ts` classify
each page by URL path using an ordered list of `{ pageType, test }` rules
(first match wins, default `generic`). The default ruleset matches
thesickestpodcast.com's structure (`/` → homepage, `/episodes` → episodes
index, `/episodes/*` → episode, `/booking` → booking, `/booking/*` →
service) but is a plain data structure, so a different site can supply its
own rule list without touching the classifier or the rules engine.

### Sitemap coverage vs. internal link discovery

Beyond crawling the sitemap, the crawler follows internal links found on
crawled pages (see `DISCOVER_INTERNAL_URLS`/`MAX_DISCOVERED_PAGES`/
`MAX_CRAWL_DEPTH`), skipping obvious assets (images, CSS, JS, PDFs, fonts,
video/audio) and URLs still carrying several non-tracking query parameters
after normalization. Comparing the sitemap URL set against the full
crawled/discovered set is what powers `indexable_page_missing_from_sitemap`
and `orphaned_sitemap_page` — the goal is to surface real discrepancies
between "what the sitemap says" and "what the site actually links to,"
not to assume the sitemap is correct.

## 7. Current limitations

- **Static HTML only.** Pages that render their SEO-relevant content via
  client-side JavaScript (no server-side/static HTML) will not be analyzed
  correctly, since the crawler does not execute JavaScript (no Playwright/
  headless browser in this version).
- **Broken internal link detection is crawl-scoped.** A link is only
  flagged as broken if its target was also part of this crawl (sitemap or
  discovered) and returned a 4xx/5xx. Internal links to URLs outside both
  the sitemap and the discovery budget are not separately fetched or
  verified.
- **Discovery is budget-limited, not exhaustive.** Internal link discovery
  stops at `MAX_DISCOVERED_PAGES` additional pages and `MAX_CRAWL_DEPTH`
  link-hops from the sitemap seed pages; a very large or deeply nested site
  may have pages this run never reaches. "Indexable pages missing from the
  sitemap" is therefore a lower bound, not a guaranteed complete count.
- **"Orphaned sitemap page" is diagnostic, not definitive.** It only means
  no *crawled* page links to that URL — it doesn't know about navigation
  rendered by JavaScript, or links from pages outside the crawl budget.
- **Historical comparison requires Supabase.** Without `PERSIST_RESULTS=true`
  and valid Supabase credentials, each run still overwrites
  `output/latest-crawl.json` with no history kept (see section 9).
- **robots.txt handling is best-effort.** Only simple `User-agent`/
  `Disallow`/`Sitemap` directives are parsed; wildcard and `Allow`
  precedence rules are not implemented.
- **Publication-state evidence is narrow.** Only `PodcastEpisode`
  `datePublished` is read today; a page with no structured data (or a
  different content type) always reports `publicationState: "unknown"`,
  which routes noindex episodes to a low-severity review finding rather
  than silence or a guess.
- **Indexing rules currently cover one page type.** `src/indexing/indexingRules.ts`
  only has an entry for `episode`; every other page type defaults to
  "noindex is assumed intentional," which avoids false positives but also
  means a genuine unexpected-noindex bug on, say, a service page won't be
  caught until that page type gets its own rule.

## 8. Planned future improvements

Structured so these can be added without reworking the core engine:

- Google Search Console and PageSpeed Insights / Core Web Vitals
  integration
- Scheduled audits
- Email / Discord / Slack reporting
- AI/LLM-based qualitative analysis layered on top of the deterministic
  report
- Automated GitHub issue creation and PR recommendations

Already implemented as of Step 2 (section 9): Supabase persistence of crawl
history, and comparison against the previous crawl (new/ongoing/resolved
issues, page lifecycle, metadata/indexing/sitemap changes) plus a minimal
multi-site dashboard.

## 9. Database Setup, Historical Comparison, and Dashboard (Step 2)

### Database setup

This repo had no `supabase/migrations` folder before Step 2. The Supabase
project it connects to (in this deployment) is shared with an unrelated
internal app that already has tables like `scorecard`, `rocks`, `issues`,
`todos`, `tasks`, `people`, `meetings`, etc. To guarantee no collisions
(`issues` and `tasks` in particular already exist with a different shape),
every SEO Watchdog table is namespaced with an `seo_` prefix and the
migration is purely additive — nothing from the existing schema is
touched, renamed, or dropped.

Migration file: `supabase/migrations/0001_seo_watchdog_core_schema.sql`.

Final table mapping:

| Concept          | Table                    |
| ---------------- | ------------------------ |
| Sites            | `seo_sites`               |
| Crawl runs       | `seo_crawl_runs`          |
| Page snapshots   | `seo_page_snapshots` (immutable per crawl run) |
| Issue snapshots  | `seo_issue_snapshots`     |
| Change events    | `seo_change_events`       |

RLS is enabled on all five tables with a permissive `for all using (true)`
policy, scoped only to these tables — matching the convention already used
throughout the rest of that Supabase project (no auth layer exists there
today). This is safe here because the tables are only ever written with the
service role key from trusted server-side code (the CLI and the dashboard
server), and the dashboard's browser code never talks to Supabase directly
(see "Dashboard" below).

To apply the migration, run its SQL against your Supabase project (via the
Supabase CLI's `supabase db push`, the SQL editor in the dashboard, or your
own migration runner) — it's a plain idempotent (`create table if not
exists`) SQL file with no project-specific tooling required.

### Baseline process

1. **First persisted crawl** (`PERSIST_RESULTS=true`, no prior successful
   crawl for that site's `domain` in `seo_crawl_runs`): stored normally, but
   `comparison.baseline` is `true` and no synthetic "new" events are
   generated for its pages/issues. Console output prints "Baseline crawl
   established."
2. **Every later crawl**: compared against the most recent crawl run with
   `status = 'success'` for the same site (via `seo_sites.domain`, derived
   from the site's hostname — so `https://example.com` and
   `https://example.com/` are the same site). `partial`/`failed` runs are
   never used as a comparison baseline, by construction of that query.
3. If persistence itself fails partway through a crawl (e.g. Supabase drops
   mid-write), the crawl run is marked `partial` (if page/issue snapshots
   were already saved) or `failed` (if nothing was saved yet), an error is
   logged, and `output/latest-crawl.json` is still written locally with
   `persistence.status` reflecting what happened.

### Historical comparison

Comparison logic lives under `src/history/` (`normalizeForComparison.ts`,
`issueKey.ts`, `compareIssues.ts`, `comparePages.ts`, `compareCrawls.ts`,
`changeEventFactory.ts`) and is deliberately independent of the
crawler/analyzer — it only consumes the same `PageResult[]`/`Issue[]` shapes
those already produce, plus a read of the previous crawl's persisted
snapshots.

- **Issue identity** is a stable key: `normalizedUrl::issueType` (see
  `buildIssueKey`), not a random id — so the same logical issue matches
  across crawls even though every row gets a fresh UUID.
- **Noise is filtered deliberately**: whitespace-only text edits, trailing
  slashes, and UTM parameters never register as a change; structured-data
  `@type` sets are compared unordered/deduped; word count only "changes" at
  ≥100 words absolute or ≥30% relative; internal-inbound-link-count changes
  are ignored unless the page crosses into/out of zero (possible orphaning)
  or moves by ≥5.
- **Event types**: `issue_new` / `issue_ongoing` / `issue_resolved` /
  `severity_changed`, `page_new` / `page_removed`, `field_changed`,
  `indexability_changed`, `indexing_state_changed`,
  `publication_state_changed`, `page_added_to_sitemap` /
  `page_removed_from_sitemap`, `page_became_discovered` /
  `page_no_longer_discovered`, `http_status_changed`, `canonical_changed`.

### Dashboard

`npm run dashboard` starts a small local, **read-only** server
(`src/dashboard/server.ts`, plain Node `http` — no framework added) on
`http://localhost:4173` (configurable via `DASHBOARD_PORT`). It:

- holds `SUPABASE_SERVICE_ROLE_KEY` server-side only,
- exposes a small JSON API under `/api/*` (sites, latest crawl + since-last-crawl
  summary, crawl history, recent change events, current issues, pages),
- serves the static page in `public/dashboard/` (`index.html` / `app.js` /
  `styles.css`, vanilla JS, no build step or frontend framework).

It cannot modify SEO metadata, resolve issues, delete crawls, or trigger a
new audit — it only reads. This is intended as a **local/internal
development dashboard** for now; it has no authentication of its own, so
don't expose `DASHBOARD_PORT` beyond localhost/your own network without
adding one.

Run it after at least one persisted crawl (`PERSIST_RESULTS=true`) exists:

```bash
npm run audit       # with PERSIST_RESULTS=true, once or twice to get history
npm run dashboard   # then open http://localhost:4173
```

## Project structure

```
src/
  config/        env loading & validation (Zod)
  crawler/       HTTP fetching + concurrency-limited crawl + internal-link discovery
  sitemap/       robots.txt + sitemap(index) discovery/parsing
  analyzer/      HTML -> PageResult extraction (Cheerio)
  pageTypes/     URL-pattern-based page classification (modular, per-site rules)
  indexing/      noindex reasoning: publication state + per-site indexing rules
  rules/         severity thresholds + rules engine + duplicate/coverage detection
  types/         shared TypeScript types
  utils/         URL normalization (incl. tracking-param stripping), logging
  db/            Supabase client + seo_* table read/write functions
  history/       crawl-to-crawl comparison (normalization, issue/page diffing, change events)
  persistence/   orchestrates "persist this crawl, then compare it" (never throws)
  dashboard/     local read-only dashboard server + its JSON API
  index.ts       CLI entrypoint (`npm run audit`)
public/
  dashboard/     static dashboard page (index.html / app.js / styles.css)
supabase/
  migrations/    additive SQL migrations (seo_* tables only)
output/
  latest-crawl.json
```

## Security notes

- Crawled HTML is parsed with Cheerio only — never executed as script.
- JSON-LD blocks are parsed with `JSON.parse` inside a try/catch; malformed
  data is skipped rather than crashing the crawl.
- No environment variables are included in the report output.
