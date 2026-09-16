import type { PageType } from "../types/seo.js";
import { defaultPageTypeRules, type PageTypeRule } from "./pageTypeRules.js";

/**
 * Deterministically classifies a URL into a PageType using an ordered list
 * of rules (defaulting to `defaultPageTypeRules`). Falls back to "generic"
 * for any same-site URL that doesn't match a specific rule, and "unknown"
 * only when the URL itself can't be parsed.
 */
export function classifyPage(url: string, rules: PageTypeRule[] = defaultPageTypeRules): PageType {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return "unknown";
  }

  const segments = path.split("/").filter((s) => s.length > 0);
  const ctx = { path, segments };

  for (const rule of rules) {
    if (rule.test(ctx)) return rule.pageType;
  }

  return "generic";
}
