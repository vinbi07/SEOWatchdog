import type { CheerioAPI } from "cheerio";

/**
 * Reads the declared charset from `<meta charset="...">` or the older
 * `<meta http-equiv="Content-Type" content="text/html; charset=...">` form.
 * Records whatever value is present rather than requiring UTF-8 specifically.
 */
export function extractCharset($: CheerioAPI): string | null {
  const direct = $("meta[charset]").first().attr("charset");
  if (direct && direct.trim()) return direct.trim();

  const httpEquiv = $('meta[http-equiv="Content-Type" i]').first().attr("content");
  if (httpEquiv) {
    const match = /charset\s*=\s*([^;]+)/i.exec(httpEquiv);
    if (match?.[1]?.trim()) return match[1].trim();
  }

  return null;
}

/**
 * Detects a leading HTML5 doctype in the raw response body. Deliberately
 * only checks for the modern `<!doctype html>` form (case-insensitive) —
 * legacy XHTML/HTML4 doctypes are treated the same as "missing" rather than
 * specially classified, per the "don't overcomplicate legacy doctypes" brief.
 */
export function hasHtml5Doctype(html: string): boolean {
  return /^\s*<!doctype\s+html\s*>/i.test(html);
}
