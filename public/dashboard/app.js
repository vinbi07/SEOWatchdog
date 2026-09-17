const state = { siteId: null, sites: [] };

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function card(label, value) {
  return `<div class="card"><div class="label">${label}</div><div class="value">${value}</div></div>`;
}

function severitySpan(severity) {
  if (!severity) return "";
  return `<span class="severity-${severity}">${severity.toUpperCase()}</span>`;
}

async function loadSites() {
  state.sites = await fetchJson("/api/sites");
  const select = document.getElementById("siteSelect");
  select.innerHTML = state.sites
    .map((site) => `<option value="${site.id}">${site.name} (${site.domain})</option>`)
    .join("");
  if (state.sites.length > 0) {
    state.siteId = state.sites[0].id;
    select.value = state.siteId;
  }
  select.addEventListener("change", () => {
    state.siteId = select.value;
    refreshAll();
  });
}

async function loadLatestCrawl() {
  const el = document.getElementById("latestCrawlBody");
  const sinceEl = document.getElementById("sinceLastCrawlBody");
  if (!state.siteId) {
    el.textContent = "No sites yet.";
    sinceEl.textContent = "No sites yet.";
    return;
  }

  const { crawlRun, sinceLastCrawl } = await fetchJson(`/api/latest-crawl?siteId=${state.siteId}`);

  if (!crawlRun) {
    el.textContent = "No crawls recorded for this site yet.";
    sinceEl.textContent = "—";
    return;
  }

  el.innerHTML = `
    <div class="cards">
      ${card("Crawled", fmtDate(crawlRun.started_at))}
      ${card("Status", crawlRun.status)}
      ${card("Total Pages", crawlRun.total_pages)}
      ${card("Critical", crawlRun.critical_count)}
      ${card("High", crawlRun.high_count)}
      ${card("Medium", crawlRun.medium_count)}
      ${card("Low", crawlRun.low_count)}
    </div>
    <div class="cards" style="margin-top:0.75rem">
      ${card("Indexable", crawlRun.indexable_count)}
      ${card("Expected Noindex", crawlRun.noindex_expected_count)}
      ${card("Noindex Review", crawlRun.noindex_review_count)}
      ${card("Unexpected Noindex", crawlRun.noindex_unexpected_count)}
    </div>
    <div class="cards" style="margin-top:0.75rem">
      ${card("Sitemap URLs", crawlRun.sitemap_urls)}
      ${card("Discovered URLs", crawlRun.internally_discovered_urls)}
      ${card("Not in Sitemap", crawlRun.discovered_not_in_sitemap)}
      ${card("Orphaned Sitemap Pages", crawlRun.orphaned_sitemap_pages)}
    </div>
  `;

  if (!sinceLastCrawl) {
    sinceEl.textContent = "Baseline crawl — nothing to compare yet.";
  } else {
    sinceEl.innerHTML = `
      <div class="cards">
        ${card("New Issues", sinceLastCrawl.newIssues)}
        ${card("Resolved", sinceLastCrawl.resolvedIssues)}
        ${card("New Pages", sinceLastCrawl.newPages)}
        ${card("Missing", sinceLastCrawl.removedPages)}
        ${card("Changed", sinceLastCrawl.changedPages)}
      </div>
    `;
  }

  return crawlRun;
}

async function loadChanges() {
  if (!state.siteId) return;
  const eventType = document.getElementById("eventTypeFilter").value;
  const severity = document.getElementById("severityFilter").value;
  const params = new URLSearchParams({ siteId: state.siteId, limit: "100" });
  if (eventType) params.set("eventType", eventType);
  if (severity) params.set("severity", severity);

  const changes = await fetchJson(`/api/changes?${params.toString()}`);

  const eventTypeSelect = document.getElementById("eventTypeFilter");
  if (eventTypeSelect.options.length <= 1) {
    const types = Array.from(new Set(changes.map((c) => c.event_type))).sort();
    eventTypeSelect.innerHTML =
      `<option value="">All</option>` + types.map((t) => `<option value="${t}">${t}</option>`).join("");
    eventTypeSelect.value = eventType;
  }

  const tbody = document.querySelector("#changesTable tbody");
  tbody.innerHTML = changes
    .map(
      (c) => `
      <tr>
        <td>${fmtDate(c.created_at)}</td>
        <td>${c.event_type}</td>
        <td>${severitySpan(c.severity)}</td>
        <td>${c.url ?? "—"}</td>
        <td>${c.message}</td>
      </tr>`
    )
    .join("");
}

async function loadIssues() {
  if (!state.siteId) return;
  const issues = await fetchJson(`/api/issues?siteId=${state.siteId}`);
  const tbody = document.querySelector("#issuesTable tbody");
  tbody.innerHTML = issues
    .map(
      (issue) => `
      <tr>
        <td>${severitySpan(issue.severity)}</td>
        <td>${issue.url}</td>
        <td>${issue.issue_type}</td>
        <td>${issue.message}</td>
      </tr>`
    )
    .join("");
}

async function loadPages() {
  if (!state.siteId) return;
  const pages = await fetchJson(`/api/pages?siteId=${state.siteId}`);

  const pageTypeSelect = document.getElementById("pageTypeFilter");
  if (pageTypeSelect.options.length <= 1) {
    const types = Array.from(new Set(pages.map((p) => p.page_type))).sort();
    pageTypeSelect.innerHTML =
      `<option value="">All</option>` + types.map((t) => `<option value="${t}">${t}</option>`).join("");
  }

  const pageTypeFilter = pageTypeSelect.value;
  const indexingStateFilter = document.getElementById("indexingStateFilter").value;

  const filtered = pages.filter(
    (p) => (!pageTypeFilter || p.page_type === pageTypeFilter) && (!indexingStateFilter || p.indexing_state === indexingStateFilter)
  );

  const tbody = document.querySelector("#pagesTable tbody");
  tbody.innerHTML = filtered
    .map(
      (p) => `
      <tr>
        <td>${p.url}</td>
        <td>${p.page_type}</td>
        <td>${p.status_code ?? "—"}</td>
        <td>${p.indexing_state}</td>
        <td>${p.title ?? ""}</td>
        <td>${p.internal_inbound_link_count}</td>
        <td>${p.issue_count}</td>
      </tr>`
    )
    .join("");
}

async function loadCrawlHistory() {
  if (!state.siteId) return;
  const history = await fetchJson(`/api/crawl-history?siteId=${state.siteId}&limit=20`);
  const tbody = document.querySelector("#historyTable tbody");
  tbody.innerHTML = history
    .map(
      (run) => `
      <tr>
        <td>${fmtDate(run.started_at)}</td>
        <td>${run.status}</td>
        <td>${run.total_pages}</td>
        <td>${run.critical_count}</td>
        <td>${run.high_count}</td>
        <td>${run.medium_count}</td>
        <td>${run.low_count}</td>
      </tr>`
    )
    .join("");
}

async function refreshAll() {
  await loadLatestCrawl();
  await Promise.all([loadChanges(), loadIssues(), loadPages(), loadCrawlHistory()]);
}

document.getElementById("eventTypeFilter").addEventListener("change", loadChanges);
document.getElementById("severityFilter").addEventListener("change", loadChanges);
document.getElementById("pageTypeFilter").addEventListener("change", loadPages);
document.getElementById("indexingStateFilter").addEventListener("change", loadPages);

(async function init() {
  try {
    await loadSites();
    await refreshAll();
  } catch (err) {
    document.getElementById("app").innerHTML = `<p style="color:#dc2626">Failed to load dashboard: ${err.message}</p>`;
  }
})();
