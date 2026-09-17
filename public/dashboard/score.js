// Rendering helpers for the SEO score HUD: system health core, category
// diagnostic modules, and score breakdown. Loaded before app.js (no bundler —
// same global-script pattern as labels.js). Purely presentational: every
// number here comes from the /api/latest-crawl `score` field or
// /api/score-history, never computed client-side.

const SCORE_CATEGORY_ORDER = ["technical", "onPage", "content", "internalLinks", "indexing", "performance"];

const SCORE_FIELD_BY_CATEGORY = {
  technical: "technical_score",
  onPage: "on_page_score",
  content: "content_score",
  internalLinks: "internal_linking_score",
  indexing: "indexing_score",
  performance: "performance_score",
};

function getThemeColor(name) {
  try {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name);
    return value ? value.trim() : null;
  } catch {
    return null;
  }
}

function scoreTone(score) {
  if (score >= 90) return "ok";
  if (score >= 80) return "ok";
  if (score >= 70) return "medium";
  if (score >= 50) return "high";
  return "critical";
}

/** A circular progress ring for a 0-100 score. Returns SVG only — the caller overlays the numeric value as HTML text (see .score-ring-center) so the number stays a real, selectable, screen-reader-visible value rather than baked into the graphic. */
function scoreRingSvg(score, size, strokeWidth, tone) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const offset = circumference * (1 - pct);
  const center = size / 2;
  return `
    <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" class="score-ring" role="presentation" focusable="false">
      <circle cx="${center}" cy="${center}" r="${radius}" class="score-ring-track" stroke-width="${strokeWidth}" fill="none" />
      <circle cx="${center}" cy="${center}" r="${radius}" class="score-ring-progress tone-${tone}" stroke-width="${strokeWidth}" fill="none"
        stroke-dasharray="${circumference.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}" stroke-linecap="round" />
    </svg>
  `;
}

function currentSiteDomain() {
  const site = state.sites?.find((s) => s.id === state.siteId);
  return site?.domain ?? null;
}

function renderHeroScore(score) {
  const el = document.getElementById("heroScoreBody");
  if (!el) return;

  if (!score) {
    el.innerHTML = `<p class="empty-state">Score not calculated for this crawl. Run <code>npm run scores:backfill</code> to fill in older crawls, or wait for the next one.</p>`;
    return;
  }

  const label = scoreLabelFor(score.overall_score);
  const tone = scoreTone(score.overall_score);
  const delta = typeof score.score_delta === "number" ? score.score_delta : null;

  let deltaHtml = "";
  if (delta !== null && delta !== 0) {
    const deltaTone = delta > 0 ? "ok" : "critical";
    const arrow = delta > 0 ? "▲" : "▼";
    deltaHtml = `<div class="hero-score-delta tone-${deltaTone}" data-score-improved="${delta > 0}">${arrow} ${esc(Math.abs(delta))} SINCE LAST SCAN</div>`;
  } else if (delta === 0) {
    deltaHtml = `<div class="hero-score-delta">NO CHANGE SINCE LAST SCAN</div>`;
  }

  const domain = currentSiteDomain();
  const domainHtml = domain ? `<div class="hero-score-target">${esc(domain)}</div>` : "";

  el.innerHTML = `
    <div class="hero-score tone-${tone}">
      <div class="hero-score-hud" aria-hidden="true">
        <div class="hud-sweep"></div>
        <div class="hud-ticks"></div>
      </div>
      <button type="button" class="hero-score-number" id="heroScoreOpenBreakdown" aria-label="View score breakdown: ${esc(score.overall_score)} out of 100, ${esc(label)}">
        <div class="score-ring-wrap score-ring-hero">
          ${scoreRingSvg(score.overall_score, 200, 10, tone)}
          <div class="score-ring-center">
            <span class="hero-score-value">${esc(score.overall_score)}</span>
            <span class="hero-score-caption">SYSTEM HEALTH</span>
          </div>
        </div>
      </button>
      <div class="hero-score-main">
        ${domainHtml}
        <div class="hero-score-label">${esc(label).toUpperCase()}</div>
        ${deltaHtml}
      </div>
    </div>
  `;

  const openBtn = document.getElementById("heroScoreOpenBreakdown");
  if (openBtn) openBtn.addEventListener("click", () => openScoreBreakdown(score));
}

function renderCategoryTiles(score) {
  const el = document.getElementById("categoryTilesBody");
  if (!el) return;

  if (!score) {
    el.innerHTML = "";
    return;
  }

  el.innerHTML = SCORE_CATEGORY_ORDER.map((category) => {
    const value = score[SCORE_FIELD_BY_CATEGORY[category]];
    const tone = scoreTone(value);
    const realLabel = SCORE_CATEGORY_LABELS[category] ?? category;
    const moduleLabel = SCORE_CATEGORY_COZY_LABELS[category] ?? category;
    return `
      <button type="button" class="category-tile tone-${tone}" data-category="${esc(category)}" tabindex="0" aria-label="${esc(realLabel)}: ${esc(value)} out of 100">
        <div class="score-ring-wrap score-ring-small">
          ${scoreRingSvg(value, 64, 6, tone)}
          <div class="score-ring-center"><span class="category-tile-value">${esc(value)}%</span></div>
        </div>
        <div class="category-tile-module">${esc(moduleLabel)}</div>
        <div class="category-tile-real">${esc(realLabel)}</div>
      </button>
    `;
  }).join("");

  el.querySelectorAll(".category-tile").forEach((tile) => {
    tile.addEventListener("click", () => openCategoryDetail(tile.dataset.category, score));
  });
  el.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const tile = e.target.closest(".category-tile");
    if (!tile) return;
    e.preventDefault();
    openCategoryDetail(tile.dataset.category, score);
  });
}

function breakdownForCategory(score, category) {
  const breakdown = score.score_breakdown || {};
  return breakdown[category] || null;
}

function penaltyListHtml(penalties) {
  if (!penalties || penalties.length === 0) return `<p class="empty-state">No penalties in this category.</p>`;
  return `
    <ul class="mini-list">
      ${penalties
        .slice()
        .sort((a, b) => b.totalPenalty - a.totalPenalty)
        .map(
          (p) =>
            `<li>${severityLabel(p.severity)} ${esc(labelFor(ISSUE_TYPE_LABELS, p.issueType))} <span class="muted">(${esc(p.occurrences)}×, -${esc(p.totalPenalty.toFixed(1))} pts)</span></li>`
        )
        .join("")}
    </ul>
  `;
}

function bonusListHtml(bonuses) {
  if (!bonuses || bonuses.length === 0) return `<p class="empty-state">No bonus signals recorded.</p>`;
  return `
    <ul class="mini-list">
      ${bonuses.map((b) => `<li class="resolved-issue">✓ ${esc(b.signal.replace(/_/g, " "))} <span class="muted">(+${esc(b.bonus)} pts)</span></li>`).join("")}
    </ul>
  `;
}

function openCategoryDetail(category, score) {
  const breakdown = breakdownForCategory(score, category);
  const realLabel = SCORE_CATEGORY_LABELS[category] ?? category;
  const cozyLabel = SCORE_CATEGORY_COZY_LABELS[category] ?? category;

  if (!breakdown) {
    openDialog(realLabel, `<p class="empty-state">No breakdown available for this category.</p>`);
    return;
  }

  openDialog(`${cozyLabel} — ${realLabel}`, `
    <dl class="detail-list">
      <dt>Score</dt><dd>${esc(breakdown.finalScore)} / 100</dd>
      <dt>Weight</dt><dd>${esc(Math.round(breakdown.weight * 100))}%</dd>
      <dt>Contribution</dt><dd>${esc(breakdown.contribution.toFixed(1))} pts to overall score</dd>
      <dt>Penalties</dt><dd>${penaltyListHtml(breakdown.penalties)}</dd>
      <dt>Healthy Signals</dt><dd>${bonusListHtml(breakdown.bonuses)}</dd>
    </dl>
  `);
}

function openScoreBreakdown(score) {
  const rows = SCORE_CATEGORY_ORDER.map((category) => {
    const breakdown = breakdownForCategory(score, category);
    if (!breakdown) return "";
    return `
      <tr>
        <td>${esc(SCORE_CATEGORY_LABELS[category] ?? category)}</td>
        <td>${esc(Math.round(breakdown.weight * 100))}%</td>
        <td>${esc(breakdown.finalScore)}</td>
        <td>${esc(breakdown.contribution.toFixed(1))} pts</td>
      </tr>
    `;
  }).join("");

  const allPenalties = SCORE_CATEGORY_ORDER.flatMap((category) => breakdownForCategory(score, category)?.penalties ?? [])
    .slice()
    .sort((a, b) => b.totalPenalty - a.totalPenalty)
    .slice(0, 5);

  const deductionsHtml =
    allPenalties.length === 0
      ? `<p class="empty-state">No deductions — nothing pulled the score down.</p>`
      : `<ul class="mini-list">${allPenalties.map((p) => `<li>${esc(labelFor(ISSUE_TYPE_LABELS, p.issueType))}: -${esc(p.totalPenalty.toFixed(1))} pts</li>`).join("")}</ul>`;

  openDialog("How This Score Is Calculated", `
    <table>
      <thead><tr><th>Category</th><th>Weight</th><th>Score</th><th>Contribution</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="hint" style="margin-top:0.75rem">Overall: ${esc(score.overall_score_raw.toFixed(1))} → <strong>${esc(score.overall_score)}</strong>${score.safety_cap_applied ? ` <span class="muted">(capped: ${esc(score.safety_cap_applied.replace(/_/g, " "))})</span>` : ""}</p>
    <h3 style="margin-top:1rem">Main Deductions</h3>
    ${deductionsHtml}
  `);
}

// --- Score history sparkline ---------------------------------------------

async function loadScoreHistory() {
  const el = document.getElementById("scoreTrendBody");
  if (!el || !state.siteId) return;
  try {
    const history = await fetchJson(`/api/score-history?siteId=${state.siteId}&limit=30`);
    if (history.length < 2) {
      el.innerHTML = "";
      return;
    }
    const chronological = history.slice().reverse();
    const chart = sparklineSvg(
      [{ label: "Overall Score", values: chronological.map((r) => r.overall_score) }],
      [getThemeColor("--accent") || "#6f7f63"]
    );
    el.innerHTML = `<div><h3>Score Trend</h3>${chart}</div>`;
  } catch {
    el.innerHTML = "";
  }
}
