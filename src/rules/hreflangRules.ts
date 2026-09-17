import type { AlternateLink, Issue } from "../types/seo.js";

const VALID_HREFLANG_PATTERN = /^(x-default|[a-z]{2,3}(-[a-z0-9]{2,8})*)$/i;

/**
 * Only produces issues when alternate/hreflang links actually exist on the
 * page — a normal monolingual site with none is never flagged.
 */
export function findHreflangIssues(alternateLinks: AlternateLink[], url: string): Issue[] {
  if (alternateLinks.length === 0) return [];

  const issues: Issue[] = [];

  const missingHref = alternateLinks.filter((link) => !link.href);
  if (missingHref.length > 0) {
    issues.push({
      issueType: "hreflang_missing_href",
      severity: "medium",
      message: `${missingHref.length} hreflang alternate link(s) are missing an href attribute.`,
      recommendation: "Every rel=\"alternate\" hreflang link needs a valid href pointing to the translated/regional page.",
      url,
      value: { hreflangs: missingHref.map((l) => l.hreflang) },
    });
  }

  const invalid = alternateLinks.filter((link) => link.hreflang && !VALID_HREFLANG_PATTERN.test(link.hreflang));
  if (invalid.length > 0) {
    issues.push({
      issueType: "invalid_hreflang",
      severity: "low",
      message: `${invalid.length} hreflang value(s) don't look like valid language[-region] codes: ${invalid.map((l) => `"${l.hreflang}"`).join(", ")}.`,
      recommendation: "Use valid ISO 639-1 language codes, optionally with an ISO 3166-1 region (e.g. \"en\", \"en-US\"), or \"x-default\".",
      url,
      value: { invalidValues: invalid.map((l) => l.hreflang) },
    });
  }

  const byLanguage = new Map<string, Set<string>>();
  for (const link of alternateLinks) {
    if (!link.hreflang || !link.href) continue;
    const set = byLanguage.get(link.hreflang.toLowerCase()) ?? new Set<string>();
    set.add(link.href);
    byLanguage.set(link.hreflang.toLowerCase(), set);
  }
  const duplicateLanguages = Array.from(byLanguage.entries()).filter(([, hrefs]) => hrefs.size > 1);
  if (duplicateLanguages.length > 0) {
    issues.push({
      issueType: "hreflang_duplicate_language",
      severity: "medium",
      message: `The same hreflang value is declared more than once with different URLs: ${duplicateLanguages.map(([lang]) => lang).join(", ")}.`,
      recommendation: "Declare each hreflang language/region exactly once, pointing to a single canonical URL for that variant.",
      url,
      value: Object.fromEntries(duplicateLanguages.map(([lang, hrefs]) => [lang, Array.from(hrefs)])),
    });
  }

  return issues;
}
