import type { AnchorMetrics, Issue } from "../types/seo.js";

export function findAnchorIssues(metrics: AnchorMetrics, url: string): Issue[] {
  const issues: Issue[] = [];

  if (metrics.emptyInternalAnchorCount > 0) {
    issues.push({
      issueType: "empty_internal_anchor",
      severity: "medium",
      message: `${metrics.emptyInternalAnchorCount} internal link(s) have no accessible text (no visible text, aria-label, title, or alt'd image).`,
      recommendation: "Give every internal link meaningful visible text or an aria-label describing its destination.",
      url,
      value: { count: metrics.emptyInternalAnchorCount, hrefs: metrics.emptyAnchorHrefSamples },
    });
  }

  if (metrics.genericAnchorCount > 0) {
    issues.push({
      issueType: "generic_anchor_text",
      severity: "low",
      message: `${metrics.genericAnchorCount} link(s) use generic anchor text (e.g. "click here", "read more") instead of descriptive text.`,
      recommendation: "Replace generic anchor text with text that describes the linked page.",
      url,
      value: { count: metrics.genericAnchorCount, samples: metrics.genericAnchorTextSamples },
    });
  }

  for (const sample of metrics.ambiguousAnchorSamples) {
    issues.push({
      issueType: "ambiguous_repeated_anchor_text",
      severity: "low",
      message: `Anchor text "${sample.text}" is reused for ${sample.destinations.length} different internal destinations, which may confuse users and search engines about what each link leads to.`,
      recommendation: "Use distinct anchor text for links that lead to different pages.",
      url,
      value: sample,
    });
  }

  return issues;
}
