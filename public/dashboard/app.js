const state = {
  siteId: null,
  sites: [],
  staleHours: 24,
  issues: [],
  issueSort: { key: "severity", dir: "asc" },
  pages: [],
  crawlHistory: [],
};

// --- Generic helpers --------------------------------------------------

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

function esc(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function fmtShortDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function timeAgo(minutes) {
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function card(label, value, tone) {
  return `<div class="card${tone ? ` tone-${tone}` : ""}"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div></div>`;
}

function clickableCard(label, value, tone, action) {
  return `<button type="button" class="card card-button${tone ? ` tone-${tone}` : ""}" data-action="${esc(action)}">
    <div class="label">${esc(label)}</div><div class="value">${esc(value)}</div>
  </button>`;
}

function severityLabel(severity) {
  if (!severity) return "—";
  return `<span class="severity-badge severity-${severity}">${severity.toUpperCase()}</span>`;
}

function emptyState(message) {
  return `<p class="empty-state">${esc(message)}</p>`;
}

function errorState(message) {
  return `<p class="error-state" role="alert">${esc(message)}</p>`;
}

async function copyToClipboard(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    const original = button.textContent;
    button.textContent = "Copied!";
    setTimeout(() => {
      button.textContent = original;
    }, 1200);
  } catch {
    // Clipboard API unavailable (older browser, insecure context, or denied
    // permission) — fail silently rather than breaking the row.
  }
}

// --- Detail dialog ------------------------------------------------------

const detailDialog = document.getElementById("detailDialog");
const detailDialogTitle = document.getElementById("detailDialogTitle");
const detailDialogBody = document.getElementById("detailDialogBody");

function openDialog(title, bodyHtml) {
  detailDialogTitle.textContent = title;
  detailDialogBody.innerHTML = bodyHtml;
  if (typeof detailDialog.showModal === "function") {
    detailDialog.showModal();
  } else {
    detailDialog.setAttribute("open", "");
  }
}

// --- Site selection -------------------------------------------------

async function loadSites() {
  state.sites = await fetchJson("/api/sites");
  const select = document.getElementById("siteSelect");
  if (state.sites.length === 0) {
    select.innerHTML = `<option value="">No sites yet</option>`;
    return;
  }
  select.innerHTML = state.sites.map((site) => `<option value="${esc(site.id)}">${esc(site.name)} (${esc(site.domain)})</option>`).join("");

  const remembered = sessionStorage.getItem("seoWatchdog.siteId");
  state.siteId = state.sites.some((s) => s.id === remembered) ? remembered : state.sites[0].id;
  select.value = state.siteId;

  select.addEventListener("change", () => {
    state.siteId = select.value;
    sessionStorage.setItem("seoWatchdog.siteId", state.siteId);
    refreshAll();
  });
}

async function loadMeta() {
  try {
    const meta = await fetchJson("/api/meta");
    state.staleHours = meta.staleHours;
    const badge = document.getElementById("envBadge");
    if (meta.environment && meta.environment !== "production") {
      badge.textContent = meta.environment.toUpperCase();
      badge.hidden = false;
    }
  } catch {
    // Non-critical — leave the badge hidden and use the default stale threshold.
  }
}

// --- Status + Latest Health + Since Last Crawl ---------------------------

const STATUS_COPY = {
  critical: { label: "Critical", tone: "critical" },
  needs_attention: { label: "Needs Attention", tone: "high" },
  healthy: { label: "Healthy", tone: "healthy" },
};

async function loadLatestCrawl() {
  const statusEl = document.getElementById("statusBody");
  const healthEl = document.getElementById("latestCrawlBody");
  const sinceEl = document.getElementById("sinceLastCrawlBody");
  const freshnessEl = document.getElementById("freshness");

  if (!state.siteId) {
    statusEl.innerHTML = emptyState("No sites yet.");
    healthEl.innerHTML = emptyState("No sites yet.");
    sinceEl.innerHTML = emptyState("No sites yet.");
    freshnessEl.textContent = "—";
    return null;
  }

  try {
    const { crawlRun, sinceLastCrawl, status, freshness } = await fetchJson(`/api/latest-crawl?siteId=${state.siteId}`);

    if (!crawlRun) {
      statusEl.innerHTML = "";
      healthEl.innerHTML = emptyState("Run an audit to establish the first baseline.");
      sinceEl.innerHTML = emptyState("Run an audit to establish the first baseline.");
      freshnessEl.textContent = "—";
      return null;
    }

    const statusCopy = STATUS_COPY[status] ?? { label: status, tone: "" };
    statusEl.innerHTML = `<div class="status-banner tone-${statusCopy.tone}">${esc(statusCopy.label)}</div>`;

    freshnessEl.innerHTML = freshness
      ? `Last crawled: <strong>${esc(timeAgo(freshness.minutesAgo))}</strong> (${esc(fmtDate(crawlRun.finished_at ?? crawlRun.started_at))})${
          freshness.isStale ? ` <span class="stale-badge">Stale Data</span>` : ""
        }`
      : "—";

    const noCriticalOrHigh = crawlRun.critical_count === 0 && crawlRun.high_count === 0;
    healthEl.innerHTML = `
      <div class="cards severity-cards${noCriticalOrHigh ? " all-clear" : ""}">
        ${card("Critical", crawlRun.critical_count, crawlRun.critical_count > 0 ? "critical" : "ok")}
        ${card("High", crawlRun.high_count, crawlRun.high_count > 0 ? "high" : "ok")}
        ${card("Medium", crawlRun.medium_count, "medium")}
        ${card("Low", crawlRun.low_count, "low")}
      </div>
      ${noCriticalOrHigh ? `<p class="all-clear-note">No critical or high issues.</p>` : ""}
      <div class="cards secondary-cards">
        ${card("Total Pages", crawlRun.total_pages)}
        ${card("Status", crawlRun.status)}
        ${card("Indexable", crawlRun.indexable_count)}
        ${card("Noindex Review", crawlRun.noindex_review_count)}
        ${card("Noindex Unexpected", crawlRun.noindex_unexpected_count, crawlRun.noindex_unexpected_count > 0 ? "critical" : "")}
      </div>
    `;

    if (!sinceLastCrawl) {
      sinceEl.innerHTML = emptyState("Baseline crawl — nothing to compare yet.");
    } else {
      const totalMeaningful =
        sinceLastCrawl.newIssues + sinceLastCrawl.resolvedIssues + sinceLastCrawl.newPages + sinceLastCrawl.removedPages + sinceLastCrawl.changedPages;
      if (totalMeaningful === 0) {
        sinceEl.innerHTML = emptyState("No meaningful SEO changes were detected since the previous crawl.");
      } else {
        sinceEl.innerHTML = `
          <div class="cards since-cards">
            ${clickableCard("New Issues", sinceLastCrawl.newIssues, sinceLastCrawl.newIssues > 0 ? "high" : "ok", "new_issues")}
            ${clickableCard("Resolved", sinceLastCrawl.resolvedIssues, "positive", "resolved")}
            ${clickableCard("New Pages", sinceLastCrawl.newPages, "info", "")}
            ${clickableCard("Missing Pages", sinceLastCrawl.removedPages, sinceLastCrawl.removedPages > 0 ? "high" : "ok", "")}
            ${clickableCard("Changed", sinceLastCrawl.changedPages, "info", "page_changes")}
          </div>
        `;
      }
    }

    return crawlRun;
  } catch (err) {
    statusEl.innerHTML = "";
    healthEl.innerHTML = errorState(`Unable to load the latest crawl: ${err.message}`);
    sinceEl.innerHTML = errorState("Unable to load Since Last Crawl.");
    freshnessEl.textContent = "—";
    return null;
  }
}

document.getElementById("sinceLastCrawlBody").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn || !btn.dataset.action) return;
  document.getElementById("eventCategoryFilter").value = btn.dataset.action;
  document.getElementById("recentChanges").scrollIntoView({ behavior: "smooth", block: "start" });
  loadChanges();
});

// --- Recent Changes -------------------------------------------------

function changeSummary(c) {
  switch (c.event_type) {
    case "field_changed":
      if (c.field_name === "title") return `Title changed: "${esc(c.previous_value ?? "")}" → "${esc(c.current_value ?? "")}"`;
      return c.message;
    case "canonical_changed":
      return `Canonical: ${esc(c.previous_value ?? "none")} → ${esc(c.current_value ?? "none")}`;
    case "indexing_state_changed":
      return `${esc(labelFor(INDEXING_STATE_LABELS, c.previous_value))} → ${esc(labelFor(INDEXING_STATE_LABELS, c.current_value))}`;
    default:
      return c.message;
  }
}

function hasBeforeAfter(c) {
  return c.previous_value !== null || c.current_value !== null;
}

function changeRow(c) {
  const category = labelFor(EVENT_TYPE_LABELS, c.event_type);
  const expandable = hasBeforeAfter(c);
  const rowId = `change-${c.id}`;
  return `
    <tr class="change-row${expandable ? " expandable" : ""}" ${expandable ? `data-target="${rowId}" tabindex="0" role="button" aria-expanded="false"` : ""}>
      <td>${esc(fmtDate(c.created_at))}</td>
      <td>${esc(category)}</td>
      <td>${severityLabel(c.severity)}</td>
      <td>${c.url ? `<code>${esc(c.url)}</code>` : "—"}</td>
      <td>${esc(changeSummary(c))}${expandable ? ` <span class="expand-hint">▾</span>` : ""}</td>
    </tr>
    ${expandable ? `<tr class="change-detail-row" id="${rowId}" hidden><td colspan="5">${beforeAfterHtml(c)}</td></tr>` : ""}
  `;
}

function beforeAfterHtml(c) {
  const fmt = (v) => {
    if (v === null || v === undefined) return "<em>none</em>";
    if (typeof v === "object") return `<pre>${esc(JSON.stringify(v, null, 2))}</pre>`;
    return esc(String(v));
  };
  return `
    <div class="before-after">
      <div><div class="before-after-label">Before</div><div class="before-after-value">${fmt(c.previous_value)}</div></div>
      <div><div class="before-after-label">After</div><div class="before-after-value">${fmt(c.current_value)}</div></div>
    </div>
  `;
}

async function loadChanges() {
  const body = document.getElementById("changesBody");
  if (!state.siteId) return;

  const category = document.getElementById("eventCategoryFilter").value;
  const severity = document.getElementById("changesSeverityFilter").value;
  const params = new URLSearchParams({ siteId: state.siteId, limit: "50" });
  if (severity) params.set("severity", severity);

  try {
    let changes = await fetchJson(`/api/changes?${params.toString()}`);
    if (category && EVENT_CATEGORIES[category]) {
      const allowed = new Set(EVENT_CATEGORIES[category]);
      changes = changes.filter((c) => allowed.has(c.event_type));
    }

    if (changes.length === 0) {
      body.innerHTML = emptyState("No meaningful SEO changes were detected since the previous crawl.");
      return;
    }

    body.innerHTML = `
      <table>
        <thead><tr><th>Time</th><th>Type</th><th>Severity</th><th>Page</th><th>Change</th></tr></thead>
        <tbody>${changes.map(changeRow).join("")}</tbody>
      </table>
    `;
  } catch (err) {
    body.innerHTML = errorState(`Unable to load recent changes: ${err.message}`);
  }
}

document.getElementById("changesBody").addEventListener("click", (e) => {
  const row = e.target.closest(".change-row.expandable");
  if (!row) return;
  toggleChangeRow(row);
});
document.getElementById("changesBody").addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const row = e.target.closest(".change-row.expandable");
  if (!row) return;
  e.preventDefault();
  toggleChangeRow(row);
});
function toggleChangeRow(row) {
  const target = document.getElementById(row.dataset.target);
  if (!target) return;
  const expanded = row.getAttribute("aria-expanded") === "true";
  row.setAttribute("aria-expanded", String(!expanded));
  target.hidden = expanded;
}

document.getElementById("eventCategoryFilter").addEventListener("change", loadChanges);
document.getElementById("changesSeverityFilter").addEventListener("change", loadChanges);
document.getElementById("clearChangeFilters").addEventListener("click", () => {
  document.getElementById("eventCategoryFilter").value = "";
  document.getElementById("changesSeverityFilter").value = "";
  loadChanges();
});

// --- Current Issues ---------------------------------------------------

const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };

function populateSelectOptions(select, values) {
  const current = select.value;
  select.innerHTML = `<option value="">All</option>` + values.map((v) => `<option value="${esc(v)}">${esc(labelFor(ISSUE_TYPE_LABELS, v) === v ? v : labelFor(ISSUE_TYPE_LABELS, v))}</option>`).join("");
  select.value = current;
}

async function loadIssues() {
  const body = document.getElementById("issuesBody");
  if (!state.siteId) return;

  try {
    state.issues = await fetchJson(`/api/issues?siteId=${state.siteId}`);

    const typeSelect = document.getElementById("issueTypeFilter");
    if (typeSelect.options.length <= 1) {
      const types = Array.from(new Set(state.issues.map((i) => i.issue_type))).sort();
      typeSelect.innerHTML = `<option value="">All</option>` + types.map((t) => `<option value="${esc(t)}">${esc(labelFor(ISSUE_TYPE_LABELS, t))}</option>`).join("");
    }
    const pageTypeSelect = document.getElementById("issuePageTypeFilter");
    if (pageTypeSelect.options.length <= 1) {
      const types = Array.from(new Set(state.issues.map((i) => i.page_type).filter(Boolean))).sort();
      pageTypeSelect.innerHTML = `<option value="">All</option>` + types.map((t) => `<option value="${esc(t)}">${esc(labelFor(PAGE_TYPE_LABELS, t))}</option>`).join("");
    }

    renderIssues();
  } catch (err) {
    body.innerHTML = errorState(`Unable to load current issues: ${err.message}`);
  }
}

function issueAge(issue) {
  return issue.times_seen ? `${issue.times_seen} crawl${issue.times_seen === 1 ? "" : "s"}` : "1 crawl";
}

function renderIssues() {
  const body = document.getElementById("issuesBody");
  const search = document.getElementById("issueSearch").value.trim().toLowerCase();
  const severity = document.getElementById("issueSeverityFilter").value;
  const issueType = document.getElementById("issueTypeFilter").value;
  const pageType = document.getElementById("issuePageTypeFilter").value;

  let filtered = state.issues.filter((i) => {
    if (severity && i.severity !== severity) return false;
    if (issueType && i.issue_type !== issueType) return false;
    if (pageType && i.page_type !== pageType) return false;
    if (search) {
      const haystack = `${i.url} ${i.issue_type} ${i.message}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  const { key, dir } = state.issueSort;
  filtered = filtered.slice().sort((a, b) => {
    let cmp = 0;
    if (key === "severity") cmp = (SEVERITY_RANK[a.severity] ?? 4) - (SEVERITY_RANK[b.severity] ?? 4) || a.url.localeCompare(b.url);
    else if (key === "url") cmp = a.url.localeCompare(b.url);
    else if (key === "first_seen_at") cmp = new Date(a.first_seen_at || 0) - new Date(b.first_seen_at || 0);
    return dir === "asc" ? cmp : -cmp;
  });

  if (state.issues.length === 0) {
    body.innerHTML = emptyState("No critical issues detected.");
    return;
  }
  if (filtered.length === 0) {
    body.innerHTML = emptyState("No issues match the current filters.");
    return;
  }

  const sortIndicator = (k) => (state.issueSort.key === k ? (state.issueSort.dir === "asc" ? " ▲" : " ▼") : "");

  body.innerHTML = `
    <table>
      <thead>
        <tr>
          <th><button type="button" class="th-sort" data-sort="severity">Severity${sortIndicator("severity")}</button></th>
          <th><button type="button" class="th-sort" data-sort="url">Page${sortIndicator("url")}</button></th>
          <th>Issue</th>
          <th>Message</th>
          <th><button type="button" class="th-sort" data-sort="first_seen_at">First Seen${sortIndicator("first_seen_at")}</button></th>
        </tr>
      </thead>
      <tbody>
        ${filtered
          .map(
            (issue) => `
          <tr class="issue-row" data-issue-key="${esc(issue.issue_key)}" tabindex="0" role="button">
            <td>${severityLabel(issue.severity)}</td>
            <td><code>${esc(issue.url)}</code></td>
            <td>${esc(labelFor(ISSUE_TYPE_LABELS, issue.issue_type))}</td>
            <td>${esc(issue.message)}</td>
            <td>${esc(fmtShortDate(issue.first_seen_at))} <span class="muted">(${esc(issueAge(issue))})</span></td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;
}

document.getElementById("issueSearch").addEventListener("input", renderIssues);
document.getElementById("issueSeverityFilter").addEventListener("change", renderIssues);
document.getElementById("issueTypeFilter").addEventListener("change", renderIssues);
document.getElementById("issuePageTypeFilter").addEventListener("change", renderIssues);

document.getElementById("issuesBody").addEventListener("click", (e) => {
  const sortBtn = e.target.closest(".th-sort");
  if (sortBtn) {
    const key = sortBtn.dataset.sort;
    if (state.issueSort.key === key) state.issueSort.dir = state.issueSort.dir === "asc" ? "desc" : "asc";
    else state.issueSort = { key, dir: "asc" };
    renderIssues();
    return;
  }
  const row = e.target.closest(".issue-row");
  if (row) openIssueDetail(row.dataset.issueKey);
});
document.getElementById("issuesBody").addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const row = e.target.closest(".issue-row");
  if (!row) return;
  e.preventDefault();
  openIssueDetail(row.dataset.issueKey);
});

async function openIssueDetail(issueKey) {
  openDialog("Issue Detail", `<p>Loading…</p>`);
  try {
    const issue = await fetchJson(`/api/issue-detail?siteId=${state.siteId}&issueKey=${encodeURIComponent(issueKey)}`);
    detailDialogBody.innerHTML = `
      <dl class="detail-list">
        <dt>Severity</dt><dd>${severityLabel(issue.severity)}</dd>
        <dt>Issue</dt><dd>${esc(labelFor(ISSUE_TYPE_LABELS, issue.issue_type))} <span class="muted">(${esc(issue.issue_type)})</span></dd>
        <dt>URL</dt><dd><code>${esc(issue.url)}</code></dd>
        <dt>Page Type</dt><dd>${esc(labelFor(PAGE_TYPE_LABELS, issue.page_type))}</dd>
        <dt>Message</dt><dd>${esc(issue.message)}</dd>
        <dt>Recommendation</dt><dd>${esc(issue.recommendation || "—")}</dd>
        <dt>Current Value</dt><dd>${issue.value !== null && issue.value !== undefined ? `<pre>${esc(JSON.stringify(issue.value, null, 2))}</pre>` : "—"}</dd>
        <dt>First Seen</dt><dd>${esc(fmtDate(issue.first_seen_at))}</dd>
        <dt>Consecutive Crawls Detected</dt><dd>${esc(issueAge(issue))}</dd>
      </dl>
    `;
  } catch (err) {
    detailDialogBody.innerHTML = errorState(`Unable to load issue detail: ${err.message}`);
  }
}

// --- Recently Resolved ------------------------------------------------

async function loadResolvedIssues() {
  const body = document.getElementById("resolvedIssuesBody");
  if (!state.siteId) return;
  try {
    const resolved = await fetchJson(`/api/resolved-issues?siteId=${state.siteId}&limit=20`);
    if (resolved.length === 0) {
      body.innerHTML = emptyState("No issues have been resolved yet.");
      return;
    }
    body.innerHTML = `
      <ul class="resolved-list">
        ${resolved
          .map(
            (r) => `<li>
              <span class="resolved-issue">${esc(labelFor(ISSUE_TYPE_LABELS, r.issue_key ? r.issue_key.split("::")[1] : ""))}</span>
              <code>${esc(r.url ?? "")}</code>
              <span class="muted">Resolved ${esc(fmtShortDate(r.created_at))}</span>
            </li>`
          )
          .join("")}
      </ul>
    `;
  } catch (err) {
    body.innerHTML = errorState(`Unable to load resolved issues: ${err.message}`);
  }
}

// --- Pages --------------------------------------------------------------

async function loadPages() {
  const body = document.getElementById("pagesBody");
  if (!state.siteId) return;

  try {
    state.pages = await fetchJson(`/api/pages?siteId=${state.siteId}`);

    const pageTypeSelect = document.getElementById("pageTypeFilter");
    if (pageTypeSelect.options.length <= 1) {
      const types = Array.from(new Set(state.pages.map((p) => p.page_type))).sort();
      pageTypeSelect.innerHTML = `<option value="">All</option>` + types.map((t) => `<option value="${esc(t)}">${esc(labelFor(PAGE_TYPE_LABELS, t))}</option>`).join("");
    }

    renderPages();
  } catch (err) {
    body.innerHTML = errorState(`Unable to load pages: ${err.message}`);
  }
}

function indexingBadge(state_) {
  if (!state_) return "—";
  const tone = state_ === "noindex_unexpected" ? "critical" : state_ === "noindex_review" ? "medium" : state_ === "indexable" ? "ok" : "";
  return `<span class="pill tone-${tone}">${esc(labelFor(INDEXING_STATE_LABELS, state_))}</span>`;
}

function renderPages() {
  const body = document.getElementById("pagesBody");
  const search = document.getElementById("pageSearch").value.trim().toLowerCase();
  const pageType = document.getElementById("pageTypeFilter").value;
  const indexingState = document.getElementById("indexingStateFilter").value;

  const filtered = state.pages.filter((p) => {
    if (pageType && p.page_type !== pageType) return false;
    if (indexingState && p.indexing_state !== indexingState) return false;
    if (search) {
      const haystack = `${p.url} ${p.title ?? ""}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  if (state.pages.length === 0) {
    body.innerHTML = emptyState("No pages recorded yet. Run an audit to establish the first baseline.");
    return;
  }
  if (filtered.length === 0) {
    body.innerHTML = emptyState("No pages match the current filters.");
    return;
  }

  body.innerHTML = `
    <table>
      <thead>
        <tr><th>URL</th><th>Page Type</th><th>HTTP</th><th>Indexing</th><th>Title</th><th>Inbound Links</th><th>Issues</th><th>Sitemap</th><th></th></tr>
      </thead>
      <tbody>
        ${filtered
          .map(
            (p) => `
          <tr class="page-row" data-url="${esc(p.url)}" tabindex="0" role="button">
            <td><a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer" class="page-link" data-stop="1">${esc(p.url)}</a></td>
            <td>${esc(labelFor(PAGE_TYPE_LABELS, p.page_type))}</td>
            <td>${esc(p.status_code ?? "—")}</td>
            <td>${indexingBadge(p.indexing_state)}</td>
            <td>${esc(p.title ?? "")}</td>
            <td>${esc(p.internal_inbound_link_count)}</td>
            <td>${esc(p.issue_count)}</td>
            <td>${p.source_sitemap ? "Yes" : "No"}</td>
            <td><button type="button" class="link-button copy-url" data-url="${esc(p.url)}" data-stop="1">Copy URL</button></td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;
}

document.getElementById("pageSearch").addEventListener("input", renderPages);
document.getElementById("pageTypeFilter").addEventListener("change", renderPages);
document.getElementById("indexingStateFilter").addEventListener("change", renderPages);

document.getElementById("pagesBody").addEventListener("click", (e) => {
  const copyBtn = e.target.closest(".copy-url");
  if (copyBtn) {
    copyToClipboard(copyBtn.dataset.url, copyBtn);
    return;
  }
  if (e.target.closest("[data-stop]")) return; // let the "open page" link behave normally
  const row = e.target.closest(".page-row");
  if (row) openPageDetail(row.dataset.url);
});
document.getElementById("pagesBody").addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  if (e.target.closest("[data-stop]")) return;
  const row = e.target.closest(".page-row");
  if (!row) return;
  e.preventDefault();
  openPageDetail(row.dataset.url);
});

function structuredDataBadges(page) {
  const types = Array.isArray(page.structured_data) ? page.structured_data.map((s) => (typeof s === "string" ? s : s.type)).filter(Boolean) : [];
  if (types.length === 0) return emptyState("No structured data found.");
  const badges = types.map((t) => `<span class="pill">${esc(t)}</span>`).join(" ");
  return `
    <div class="structured-data-badges">${badges}</div>
    <details class="collapsible">
      <summary>View Raw Structured Data</summary>
      <pre>${esc(JSON.stringify(page.structured_data_details ?? page.structured_data, null, 2))}</pre>
    </details>
  `;
}

async function openPageDetail(url) {
  openDialog("Page Detail", `<p>Loading…</p>`);
  try {
    const { page, issues, changes } = await fetchJson(`/api/page-detail?siteId=${state.siteId}&url=${encodeURIComponent(url)}`);
    detailDialogBody.innerHTML = `
      <dl class="detail-list">
        <dt>URL</dt><dd><a href="${esc(page.url)}" target="_blank" rel="noopener noreferrer">${esc(page.url)}</a></dd>
        <dt>Final URL</dt><dd>${esc(page.final_url ?? page.url)}</dd>
        <dt>HTTP Status</dt><dd>${esc(page.status_code ?? "—")}</dd>
        <dt>Response Time</dt><dd>${page.response_time_ms ? `${esc(page.response_time_ms)} ms` : "—"}</dd>
        <dt>Page Type</dt><dd>${esc(labelFor(PAGE_TYPE_LABELS, page.page_type))}</dd>
        <dt>Indexing State</dt><dd>${indexingBadge(page.indexing_state)}</dd>
        <dt>Publication State</dt><dd>${esc(page.publication_state)}</dd>
        <dt>Title</dt><dd>${esc(page.title ?? "—")}</dd>
        <dt>Meta Description</dt><dd>${esc(page.meta_description ?? "—")}</dd>
        <dt>Canonical</dt><dd>${esc(page.canonical ?? "—")}</dd>
        <dt>H1 / H2 Count</dt><dd>${esc(page.h1_count)} / ${esc(page.h2_count)}</dd>
        <dt>Word Count</dt><dd>${esc(page.word_count)}</dd>
        <dt>Inbound / Outbound Links</dt><dd>${esc(page.internal_inbound_link_count)} / ${esc(page.internal_outbound_link_count)}</dd>
        <dt>Images</dt><dd>${esc(page.image_count)} total, ${esc(page.images_missing_alt)} missing alt</dd>
        <dt>Sitemap</dt><dd>${page.source_sitemap ? "Yes" : "No"}</dd>
        <dt>Discovered</dt><dd>${page.source_discovered ? "Yes" : "No"}</dd>
        <dt>Structured Data</dt><dd>${structuredDataBadges(page)}</dd>
        <dt>Current Issues</dt><dd>${
          issues.length === 0
            ? emptyState("No current issues on this page.")
            : `<ul class="mini-list">${issues.map((i) => `<li>${severityLabel(i.severity)} ${esc(labelFor(ISSUE_TYPE_LABELS, i.issue_type))}</li>`).join("")}</ul>`
        }</dd>
        <dt>Recent Changes</dt><dd>${
          changes.length === 0
            ? emptyState("No recent changes for this page.")
            : `<ul class="mini-list">${changes.map((c) => `<li>${esc(fmtShortDate(c.created_at))} — ${esc(labelFor(EVENT_TYPE_LABELS, c.event_type))}: ${esc(changeSummary(c))}</li>`).join("")}</ul>`
        }</dd>
      </dl>
    `;
  } catch (err) {
    detailDialogBody.innerHTML = errorState(`Unable to load page detail: ${err.message}`);
  }
}

// --- Crawl History + Trends --------------------------------------------

function sparklineSvg(series, colors) {
  const width = 480;
  const height = 100;
  const padding = 6;
  const allValues = series.flatMap((s) => s.values);
  const max = Math.max(1, ...allValues);
  const n = series[0]?.values.length ?? 0;
  if (n < 2) return "";

  const x = (i) => padding + (i / (n - 1)) * (width - padding * 2);
  const y = (v) => height - padding - (v / max) * (height - padding * 2);

  const lines = series
    .map((s, idx) => {
      const points = s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
      return `<polyline points="${points}" fill="none" stroke="${colors[idx]}" stroke-width="2" />`;
    })
    .join("");

  const legend = series
    .map((s, idx) => `<span class="legend-item"><span class="legend-swatch" style="background:${colors[idx]}"></span>${esc(s.label)}</span>`)
    .join("");

  return `
    <div class="trend-chart">
      <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Trend chart">${lines}</svg>
      <div class="trend-legend">${legend}</div>
    </div>
  `;
}

function renderTrends(history) {
  const el = document.getElementById("trendsBody");
  if (history.length < 2) {
    el.innerHTML = "";
    return;
  }
  const chronological = history.slice().reverse();
  const issueChart = sparklineSvg(
    [
      { label: "Critical", values: chronological.map((r) => r.critical_count) },
      { label: "High", values: chronological.map((r) => r.high_count) },
      { label: "Medium", values: chronological.map((r) => r.medium_count) },
      { label: "Low", values: chronological.map((r) => r.low_count) },
    ],
    ["#dc2626", "#ea580c", "#ca8a04", "#6b7280"]
  );
  const pageChart = sparklineSvg(
    [
      { label: "Total Pages", values: chronological.map((r) => r.total_pages) },
      { label: "Indexable", values: chronological.map((r) => r.indexable_count) },
    ],
    ["#2563eb", "#16a34a"]
  );
  const changeChart = sparklineSvg(
    [
      { label: "New Issues", values: chronological.map((r) => r.changes.newIssues) },
      { label: "Resolved", values: chronological.map((r) => r.changes.resolvedIssues) },
    ],
    ["#ea580c", "#16a34a"]
  );

  el.innerHTML = `
    <div class="trends-grid">
      <div><h3>Issue Counts Over Time</h3>${issueChart}</div>
      <div><h3>Pages / Indexable Over Time</h3>${pageChart}</div>
      <div><h3>New vs Resolved Issues</h3>${changeChart}</div>
    </div>
  `;
}

async function loadCrawlHistory() {
  const body = document.getElementById("historyBody");
  if (!state.siteId) return;

  try {
    state.crawlHistory = await fetchJson(`/api/crawl-history?siteId=${state.siteId}&limit=30`);

    if (state.crawlHistory.length === 0) {
      body.innerHTML = emptyState("Run an audit to establish the first baseline.");
      document.getElementById("trendsBody").innerHTML = "";
      return;
    }

    renderTrends(state.crawlHistory);

    body.innerHTML = `
      <table>
        <thead><tr><th>Date</th><th>Status</th><th>Pages</th><th>Critical</th><th>High</th><th>Medium</th><th>Low</th><th>Changes</th></tr></thead>
        <tbody>
          ${state.crawlHistory
            .map(
              (run) => `
            <tr class="crawl-row" data-crawl-id="${esc(run.id)}" tabindex="0" role="button">
              <td>${esc(fmtDate(run.started_at))}</td>
              <td>${esc(run.status)}</td>
              <td>${esc(run.total_pages)}</td>
              <td>${esc(run.critical_count)}</td>
              <td>${esc(run.high_count)}</td>
              <td>${esc(run.medium_count)}</td>
              <td>${esc(run.low_count)}</td>
              <td>${esc(run.changes.total)}</td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    `;
  } catch (err) {
    body.innerHTML = errorState(`Unable to load crawl history: ${err.message}`);
  }
}

document.getElementById("historyBody").addEventListener("click", (e) => {
  const row = e.target.closest(".crawl-row");
  if (row) openCrawlDetail(row.dataset.crawlId);
});
document.getElementById("historyBody").addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const row = e.target.closest(".crawl-row");
  if (!row) return;
  e.preventDefault();
  openCrawlDetail(row.dataset.crawlId);
});

async function openCrawlDetail(crawlRunId) {
  openDialog("Crawl Detail", `<p>Loading…</p>`);
  try {
    const { crawlRun, previousCrawlRun, sinceLastCrawl } = await fetchJson(`/api/crawl-detail?crawlRunId=${crawlRunId}`);
    const duration =
      crawlRun.finished_at && crawlRun.started_at
        ? `${Math.round((new Date(crawlRun.finished_at) - new Date(crawlRun.started_at)) / 1000)}s`
        : "—";
    detailDialogBody.innerHTML = `
      <dl class="detail-list">
        <dt>Started</dt><dd>${esc(fmtDate(crawlRun.started_at))}</dd>
        <dt>Status</dt><dd>${esc(crawlRun.status)}</dd>
        <dt>Duration</dt><dd>${esc(duration)}</dd>
        <dt>Pages Crawled</dt><dd>${esc(crawlRun.total_pages)}</dd>
        <dt>Severity</dt><dd>Critical ${esc(crawlRun.critical_count)} · High ${esc(crawlRun.high_count)} · Medium ${esc(crawlRun.medium_count)} · Low ${esc(crawlRun.low_count)}</dd>
        <dt>Indexing</dt><dd>Indexable ${esc(crawlRun.indexable_count)} · Noindex Expected ${esc(crawlRun.noindex_expected_count)} · Review ${esc(crawlRun.noindex_review_count)} · Unexpected ${esc(crawlRun.noindex_unexpected_count)}</dd>
        <dt>Discovery</dt><dd>Sitemap ${esc(crawlRun.sitemap_urls)} · Discovered ${esc(crawlRun.internally_discovered_urls)} · Orphaned ${esc(crawlRun.orphaned_sitemap_pages)}</dd>
        <dt>Compared To</dt><dd>${previousCrawlRun ? esc(fmtDate(previousCrawlRun.started_at)) : "No previous crawl (baseline)"}</dd>
        ${
          sinceLastCrawl
            ? `<dt>Vs. Previous Crawl</dt><dd>New Issues ${esc(sinceLastCrawl.newIssues)} · Resolved ${esc(sinceLastCrawl.resolvedIssues)} · New Pages ${esc(
                sinceLastCrawl.newPages
              )} · Missing ${esc(sinceLastCrawl.removedPages)} · Changed ${esc(sinceLastCrawl.changedPages)}</dd>`
            : ""
        }
      </dl>
    `;
  } catch (err) {
    detailDialogBody.innerHTML = errorState(`Unable to load crawl detail: ${err.message}`);
  }
}

// --- Boot -----------------------------------------------------------

async function refreshAll() {
  await loadLatestCrawl();
  await Promise.allSettled([loadChanges(), loadIssues(), loadResolvedIssues(), loadPages(), loadCrawlHistory()]);
}

(async function init() {
  try {
    await loadMeta();
    await loadSites();
    if (!state.siteId) {
      document.querySelectorAll("main section > div, main section > details").forEach((el) => {
        if (el.tagName !== "DETAILS") el.innerHTML = emptyState("No sites yet. Run an audit with PERSIST_RESULTS=true to create the first one.");
      });
      return;
    }
    await refreshAll();
  } catch (err) {
    document.getElementById("app").innerHTML = errorState(`Failed to load dashboard: ${err.message}`);
  }
})();
