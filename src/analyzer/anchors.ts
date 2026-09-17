import type { CheerioAPI } from "cheerio";
import { thresholds } from "../rules/thresholds.js";
import type { AnchorEntry, AnchorMetrics } from "../types/seo.js";
import { isHttpUrl, isSameDomain, normalizeUrl } from "../utils/urls.js";

function normalizeAnchorText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Every `<a>` on the page (raw, not deduped) with normalized text and internal/external classification. */
export function extractAnchors($: CheerioAPI, pageUrl: string, siteHost: string): AnchorEntry[] {
  const anchors: AnchorEntry[] = [];

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const trimmed = href.trim();
    if (!trimmed || /^(javascript:|mailto:|tel:|data:|blob:|#)/i.test(trimmed)) return;

    const normalized = normalizeUrl(trimmed, pageUrl);
    if (!normalized || !isHttpUrl(normalized)) return;

    const anchorEl = $(el);
    const visibleText = normalizeAnchorText(anchorEl.text());

    // The anchor's accessible name: its own visible text first, falling back
    // to aria-label/title, and finally a meaningfully-alt'd image inside it
    // (an <img alt="..."> can make an otherwise textless link non-empty).
    let accessibleName = visibleText;
    if (accessibleName.length < thresholds.anchors.minMeaningfulTextLength) {
      const ariaLabel = normalizeAnchorText(anchorEl.attr("aria-label") ?? "");
      const titleAttr = normalizeAnchorText(anchorEl.attr("title") ?? "");
      accessibleName = ariaLabel || titleAttr || accessibleName;
    }
    if (accessibleName.length < thresholds.anchors.minMeaningfulTextLength) {
      const imgAlt = anchorEl
        .find("img")
        .map((_i, img) => normalizeAnchorText($(img).attr("alt") ?? $(img).attr("aria-label") ?? ""))
        .get()
        .find((alt) => alt.length >= thresholds.anchors.minMeaningfulTextLength);
      if (imgAlt) accessibleName = imgAlt;
    }

    anchors.push({
      href: normalized,
      text: accessibleName,
      isInternal: isSameDomain(normalized, siteHost),
    });
  });

  return anchors;
}

function isEmptyAnchor(anchor: AnchorEntry): boolean {
  return anchor.text.trim().length < thresholds.anchors.minMeaningfulTextLength;
}

function isGenericAnchor(anchor: AnchorEntry): boolean {
  const normalized = anchor.text.toLowerCase().replace(/[.!?\s]+$/, "");
  return (thresholds.anchors.genericTexts as readonly string[]).includes(normalized);
}

const MAX_SAMPLES = 5;

export function computeAnchorMetrics(anchors: AnchorEntry[]): AnchorMetrics {
  const internal = anchors.filter((a) => a.isInternal);
  const external = anchors.filter((a) => !a.isInternal);

  const emptyInternal = internal.filter(isEmptyAnchor);
  const generic = anchors.filter((a) => !isEmptyAnchor(a) && isGenericAnchor(a));

  // Ambiguous: the same non-generic, non-empty anchor text points at several
  // distinct internal destinations on this page.
  const destinationsByText = new Map<string, Set<string>>();
  for (const anchor of internal) {
    if (isEmptyAnchor(anchor) || isGenericAnchor(anchor)) continue;
    const key = anchor.text.toLowerCase();
    const set = destinationsByText.get(key) ?? new Set<string>();
    set.add(anchor.href);
    destinationsByText.set(key, set);
  }
  const ambiguousAnchorSamples = Array.from(destinationsByText.entries())
    .filter(([, destinations]) => destinations.size >= thresholds.anchors.minAmbiguousDestinations)
    .map(([text, destinations]) => ({ text, destinations: Array.from(destinations).slice(0, MAX_SAMPLES) }))
    .slice(0, MAX_SAMPLES);

  return {
    internalLinkCount: internal.length,
    uniqueInternalLinkCount: new Set(internal.map((a) => a.href)).size,
    externalLinkCount: external.length,
    uniqueExternalLinkCount: new Set(external.map((a) => a.href)).size,
    emptyInternalAnchorCount: emptyInternal.length,
    genericAnchorCount: generic.length,
    ambiguousAnchorTextCount: ambiguousAnchorSamples.length,
    emptyAnchorHrefSamples: emptyInternal.slice(0, MAX_SAMPLES).map((a) => a.href),
    genericAnchorTextSamples: Array.from(new Set(generic.map((a) => a.text))).slice(0, MAX_SAMPLES),
    ambiguousAnchorSamples,
  };
}
