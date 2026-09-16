import type { Issue, PageResult } from "../types/seo.js";

function groupBy(pages: PageResult[], keyFn: (page: PageResult) => string | null): Map<string, PageResult[]> {
  const groups = new Map<string, PageResult[]>();
  for (const page of pages) {
    const key = keyFn(page);
    if (key === null) continue;
    const list = groups.get(key) ?? [];
    list.push(page);
    groups.set(key, list);
  }
  return groups;
}

/**
 * Compares titles and meta descriptions across all indexable pages and
 * flags any value shared by more than one page. Returns a map of
 * page.url -> issues so callers can merge them into each page's issue list.
 */
export function findDuplicateIssues(pages: PageResult[]): Map<string, Issue[]> {
  const result = new Map<string, Issue[]>();
  const indexable = pages.filter((p) => p.isIndexable);

  function addIssue(page: PageResult, issue: Issue): void {
    const list = result.get(page.url) ?? [];
    list.push(issue);
    result.set(page.url, list);
  }

  const titleGroups = groupBy(indexable, (p) => (p.title ? p.title.trim().toLowerCase() : null));
  for (const [title, group] of titleGroups) {
    if (group.length < 2) continue;
    for (const page of group) {
      addIssue(page, {
        issueType: "duplicate_title",
        severity: "high",
        message: `Title "${page.title}" is shared by ${group.length} indexable pages.`,
        recommendation: "Write a unique title for each page.",
        url: page.url,
        value: {
          title,
          otherUrls: group.filter((p) => p.url !== page.url).map((p) => p.url),
        },
      });
    }
  }

  const descriptionGroups = groupBy(indexable, (p) =>
    p.metaDescription ? p.metaDescription.trim().toLowerCase() : null
  );
  for (const [description, group] of descriptionGroups) {
    if (group.length < 2) continue;
    for (const page of group) {
      addIssue(page, {
        issueType: "duplicate_meta_description",
        severity: "medium",
        message: `Meta description is shared by ${group.length} indexable pages.`,
        recommendation: "Write a unique meta description for each page.",
        url: page.url,
        value: {
          description,
          otherUrls: group.filter((p) => p.url !== page.url).map((p) => p.url),
        },
      });
    }
  }

  return result;
}
