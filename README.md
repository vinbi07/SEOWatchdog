# SEO Watchdog

SEO Watchdog is a deterministic, rule-based technical and on-page SEO monitoring
tool. It crawls a website's sitemap, analyzes each page for a fixed set of
technical/on-page SEO signals, applies a rules engine to flag issues by
severity, and writes a structured JSON report plus a console summary.

This is the first version of an eventual continuous monitoring system: no
AI/LLM analysis, no dashboard, no persistence — just a reliable engine that
produces structured, stable output so that future versions can answer
"what changed since the last crawl?"

## 1. What it does

1. Discovers the site's sitemap(s) via `robots.txt` and common well-known
   paths (`/sitemap.xml`, `/sitemap_index.xml`), following sitemap indexes.
2. Crawls every URL found in the sitemap (deduped, same-domain only, with
   configurable concurrency and rate limiting).
3. Parses each page's HTML with Cheerio and extracts technical/on-page SEO
   signals (titles, meta tags, headings, links, images, structured data,
   social metadata, etc.) — HTML is treated as untrusted input and is never
   executed.
4. Applies a deterministic rules engine (per-page rules + cross-page
   duplicate detection) to produce a list of severity-tagged issues.
5. Writes `output/latest-crawl.json` and prints a human-readable console
   summary.

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

Environment variables are validated at startup with Zod; the process exits
with a clear error message if `SITE_URL` is missing or invalid. No
environment variables are ever written into the report output.

## 4. Running an audit

```bash
npm run audit
```

This runs `src/index.ts` via `tsx` (no build step required). It will:

- print progress/log lines to stderr/stdout as it crawls,
- print a console summary at the end,
- write the full report to `output/latest-crawl.json`.

Other scripts:

```bash
npm run build   # type-check and compile to dist/ (optional)
npm test        # run the test suite once
npm run test:watch
```

## 5. Report structure

`output/latest-crawl.json`:

```jsonc
{
  "site": "https://thesickestpodcast.com",
  "crawlStartedAt": "2026-09-16T21:49:44.407Z",
  "crawlFinishedAt": "2026-09-16T21:49:47.912Z",
  "totalPages": 8,
  "summary": { "critical": 0, "high": 0, "medium": 7, "low": 6 },
  "pages": [ /* PageResult[] */ ]
}
```

Each entry in `pages` includes (see `src/types/seo.ts` for the full type):

- `url`, `finalUrl`, `status`, `redirectCount`, `responseTimeMs`, `outcome`
- `title`, `titleLength`, `metaDescription`, `metaDescriptionLength`,
  `canonical`
- `robotsMeta` (raw directive + parsed `noindex`/`nofollow`), `noindex`
- `h1` (array of H1 texts), `h1Count`, `h2Count`, `wordCount`
- `internalLinks`, `externalLinks`, `brokenInternalLinks`
- `images: { total, missingAlt }`
- `openGraph`, `twitter`
- `structuredData` (distinct JSON-LD `@type` values found)
- `lang`, `hasViewport`, `hasFavicon`
- `isIndexable`
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
implemented in `src/rules/rules.ts` (per-page) and
`src/rules/duplicateRules.ts` (cross-page duplicate detection). These are
**internal monitoring heuristics**, not absolute Google ranking rules.

**Critical**
- Page cannot be crawled (network error, timeout, redirect loop)
- Page returns a 5xx response
- Sitemap URL is marked `noindex`

**High**
- Page returns a 4xx response
- Missing `<title>`
- Duplicate title across multiple indexable pages
- Missing canonical tag
- Canonical points to an unexpected external domain
- Sitemap URL redirects to a different final URL

**Medium**
- Missing meta description
- Missing H1
- Title longer than ~60 characters / shorter than ~20 characters
- Meta description longer than ~160 characters
- Duplicate meta description across indexable pages
- Multiple H1 elements
- Broken internal links (detected within the crawled set)

**Low**
- Images missing `alt` attributes
- Missing Open Graph metadata
- Missing Twitter card metadata
- Missing `lang` attribute
- Missing favicon
- Unusually low word count (< 300 words)

## 7. Current limitations

- **Static HTML only.** Pages that render their SEO-relevant content via
  client-side JavaScript (no server-side/static HTML) will not be analyzed
  correctly, since the crawler does not execute JavaScript (no Playwright/
  headless browser in this version).
- **Broken internal link detection is crawl-scoped.** A link is only
  flagged as broken if its target was also part of this crawl and returned
  a 4xx/5xx. Internal links to URLs outside the sitemap are not separately
  fetched or verified.
- **Sitemap-driven only.** Only URLs reachable from the discovered
  sitemap(s) are crawled; orphan pages not listed in any sitemap are not
  discovered.
- **No historical comparison yet.** Each run overwrites
  `output/latest-crawl.json`; there is no history or diffing against a
  previous crawl (see below).
- **robots.txt handling is best-effort.** Only simple `User-agent`/
  `Disallow`/`Sitemap` directives are parsed; wildcard and `Allow`
  precedence rules are not implemented.

## 8. Planned future improvements

Structured so these can be added without reworking the core engine:

- Supabase persistence of crawl history
- Comparison against the previous crawl (newly introduced / resolved
  issues)
- Google Search Console and PageSpeed Insights / Core Web Vitals
  integration
- Scheduled audits
- Email / Discord / Slack reporting
- AI/LLM-based qualitative analysis layered on top of the deterministic
  report
- Automated GitHub issue creation and PR recommendations
- Multi-site dashboard

## Project structure

```
src/
  config/        env loading & validation (Zod)
  crawler/       HTTP fetching + concurrency-limited crawl orchestration
  sitemap/       robots.txt + sitemap(index) discovery/parsing
  analyzer/      HTML -> PageResult extraction (Cheerio)
  rules/         severity thresholds + rules engine + duplicate detection
  types/         shared TypeScript types
  utils/         URL normalization, logging
  index.ts       CLI entrypoint (`npm run audit`)
output/
  latest-crawl.json
```

## Security notes

- Crawled HTML is parsed with Cheerio only — never executed as script.
- JSON-LD blocks are parsed with `JSON.parse` inside a try/catch; malformed
  data is skipped rather than crashing the crawl.
- No environment variables are included in the report output.
