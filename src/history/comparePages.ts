import type { PageResult } from "../types/seo.js";
import { createChangeEvent } from "./changeEventFactory.js";
import {
  internalInboundLinkCountChangedSignificantly,
  normalizeUrlForComparison,
  structuredDataTypesChanged,
  textChanged,
  urlChanged,
  wordCountChangedSignificantly,
} from "./normalizeForComparison.js";
import type { ChangeEvent, PreviousPageRecord } from "./types.js";

export interface PageComparisonResult {
  changes: ChangeEvent[];
  newPageCount: number;
  removedPageCount: number;
  /** Distinct URLs (present in both crawls) that had at least one field_changed-style event. */
  changedPageCount: number;
}

function currentStructuredDataTypes(page: PageResult): string[] {
  return page.structuredData.map((entry) => entry.type);
}

export function comparePages(currentPages: PageResult[], previousPages: PreviousPageRecord[]): PageComparisonResult {
  const currentByUrl = new Map<string, PageResult>();
  for (const page of currentPages) {
    currentByUrl.set(normalizeUrlForComparison(page.url), page);
  }

  const previousByUrl = new Map<string, PreviousPageRecord>();
  for (const record of previousPages) {
    previousByUrl.set(record.normalizedUrl, record);
  }

  const changes: ChangeEvent[] = [];
  let newPageCount = 0;
  let removedPageCount = 0;
  const changedUrls = new Set<string>();

  for (const [normalizedUrl, page] of currentByUrl) {
    const previous = previousByUrl.get(normalizedUrl);

    if (!previous) {
      newPageCount += 1;
      changes.push(
        createChangeEvent({
          eventType: "page_new",
          entityType: "page",
          url: page.url,
          currentValue: { pageType: page.pageType, indexingState: page.indexingState },
          message: `New page discovered: ${page.url}`,
        })
      );
      continue;
    }

    const pageChanges: ChangeEvent[] = [];

    if (previous.statusCode !== page.status) {
      pageChanges.push(
        createChangeEvent({
          eventType: "http_status_changed",
          entityType: "page",
          url: page.url,
          fieldName: "status_code",
          previousValue: previous.statusCode,
          currentValue: page.status,
          message: `HTTP status changed: ${previous.statusCode ?? "unknown"} -> ${page.status ?? "unknown"}`,
        })
      );
    }

    if (urlChanged(previous.finalUrl, page.finalUrl)) {
      pageChanges.push(
        createChangeEvent({
          eventType: "field_changed",
          entityType: "page",
          url: page.url,
          fieldName: "final_url",
          previousValue: previous.finalUrl,
          currentValue: page.finalUrl,
          message: `Final URL changed: ${previous.finalUrl ?? "n/a"} -> ${page.finalUrl}`,
        })
      );
    }

    if (textChanged(previous.title, page.title)) {
      pageChanges.push(
        createChangeEvent({
          eventType: "field_changed",
          entityType: "page",
          url: page.url,
          fieldName: "title",
          previousValue: previous.title,
          currentValue: page.title,
          message: `Title changed: "${previous.title ?? ""}" -> "${page.title ?? ""}"`,
        })
      );
    }

    if (textChanged(previous.metaDescription, page.metaDescription)) {
      pageChanges.push(
        createChangeEvent({
          eventType: "field_changed",
          entityType: "page",
          url: page.url,
          fieldName: "meta_description",
          previousValue: previous.metaDescription,
          currentValue: page.metaDescription,
          message: "Meta description changed.",
        })
      );
    }

    if (urlChanged(previous.canonical, page.canonical)) {
      pageChanges.push(
        createChangeEvent({
          eventType: "canonical_changed",
          entityType: "page",
          url: page.url,
          fieldName: "canonical",
          previousValue: previous.canonical,
          currentValue: page.canonical,
          message: `Canonical changed: ${previous.canonical ?? "none"} -> ${page.canonical ?? "none"}`,
        })
      );
    }

    if (previous.h1Count !== page.h1Count) {
      pageChanges.push(
        createChangeEvent({
          eventType: "field_changed",
          entityType: "page",
          url: page.url,
          fieldName: "h1_count",
          previousValue: previous.h1Count,
          currentValue: page.h1Count,
          message: `H1 count changed: ${previous.h1Count} -> ${page.h1Count}`,
        })
      );
    }

    if (wordCountChangedSignificantly(previous.wordCount, page.wordCount)) {
      pageChanges.push(
        createChangeEvent({
          eventType: "field_changed",
          entityType: "page",
          url: page.url,
          fieldName: "word_count",
          previousValue: previous.wordCount,
          currentValue: page.wordCount,
          message: `Word count changed significantly: ${previous.wordCount} -> ${page.wordCount}`,
        })
      );
    }

    if (previous.noindex !== page.noindex) {
      pageChanges.push(
        createChangeEvent({
          eventType: "field_changed",
          entityType: "page",
          url: page.url,
          fieldName: "noindex",
          previousValue: previous.noindex,
          currentValue: page.noindex,
          message: `noindex changed: ${previous.noindex} -> ${page.noindex}`,
        })
      );
    }

    if (previous.isIndexable !== page.isIndexable) {
      pageChanges.push(
        createChangeEvent({
          eventType: "indexability_changed",
          entityType: "page",
          url: page.url,
          fieldName: "is_indexable",
          previousValue: previous.isIndexable,
          currentValue: page.isIndexable,
          message: `Indexability changed: ${previous.isIndexable} -> ${page.isIndexable}`,
        })
      );
    }

    if (previous.indexingState !== page.indexingState) {
      pageChanges.push(
        createChangeEvent({
          eventType: "indexing_state_changed",
          entityType: "page",
          url: page.url,
          fieldName: "indexing_state",
          previousValue: previous.indexingState,
          currentValue: page.indexingState,
          message: `Indexing state changed: ${previous.indexingState} -> ${page.indexingState}`,
        })
      );
    }

    if (previous.publicationState !== page.publicationState) {
      pageChanges.push(
        createChangeEvent({
          eventType: "publication_state_changed",
          entityType: "page",
          url: page.url,
          fieldName: "publication_state",
          previousValue: previous.publicationState,
          currentValue: page.publicationState,
          message: `Publication state changed: ${previous.publicationState} -> ${page.publicationState}`,
        })
      );
    }

    if (previous.pageType !== page.pageType) {
      pageChanges.push(
        createChangeEvent({
          eventType: "field_changed",
          entityType: "page",
          url: page.url,
          fieldName: "page_type",
          previousValue: previous.pageType,
          currentValue: page.pageType,
          message: `Page type changed: ${previous.pageType} -> ${page.pageType}`,
        })
      );
    }

    if (!previous.sourceSitemap && page.sources.sitemap) {
      pageChanges.push(
        createChangeEvent({
          eventType: "page_added_to_sitemap",
          entityType: "page",
          url: page.url,
          fieldName: "source_sitemap",
          previousValue: false,
          currentValue: true,
          message: "Page added to the sitemap.",
        })
      );
    } else if (previous.sourceSitemap && !page.sources.sitemap) {
      pageChanges.push(
        createChangeEvent({
          eventType: "page_removed_from_sitemap",
          entityType: "page",
          url: page.url,
          fieldName: "source_sitemap",
          previousValue: true,
          currentValue: false,
          message: "Page removed from the sitemap.",
        })
      );
    }

    if (!previous.sourceDiscovered && page.sources.discovered) {
      pageChanges.push(
        createChangeEvent({
          eventType: "page_became_discovered",
          entityType: "page",
          url: page.url,
          fieldName: "source_discovered",
          previousValue: false,
          currentValue: true,
          message: "Page became internally discovered via links.",
        })
      );
    } else if (previous.sourceDiscovered && !page.sources.discovered) {
      pageChanges.push(
        createChangeEvent({
          eventType: "page_no_longer_discovered",
          entityType: "page",
          url: page.url,
          fieldName: "source_discovered",
          previousValue: true,
          currentValue: false,
          message: "Page no longer has internal links pointing to it.",
        })
      );
    }

    if (internalInboundLinkCountChangedSignificantly(previous.internalInboundLinkCount, page.internalInboundLinkCount)) {
      const becameOrphaned = previous.internalInboundLinkCount > 0 && page.internalInboundLinkCount === 0;
      pageChanges.push(
        createChangeEvent({
          eventType: "field_changed",
          entityType: "page",
          url: page.url,
          fieldName: "internal_inbound_link_count",
          previousValue: previous.internalInboundLinkCount,
          currentValue: page.internalInboundLinkCount,
          message: becameOrphaned
            ? "Page lost all internal inbound links and may be orphaned."
            : `Internal inbound link count changed: ${previous.internalInboundLinkCount} -> ${page.internalInboundLinkCount}`,
          metadata: becameOrphaned ? { possiblyOrphaned: true } : {},
        })
      );
    }

    if (structuredDataTypesChanged(previous.structuredDataTypes, currentStructuredDataTypes(page))) {
      pageChanges.push(
        createChangeEvent({
          eventType: "field_changed",
          entityType: "page",
          url: page.url,
          fieldName: "structured_data",
          previousValue: previous.structuredDataTypes,
          currentValue: currentStructuredDataTypes(page),
          message: "Structured data types changed.",
        })
      );
    }

    if (pageChanges.length > 0) {
      changedUrls.add(normalizedUrl);
      changes.push(...pageChanges);
    }
  }

  for (const [normalizedUrl, previous] of previousByUrl) {
    if (currentByUrl.has(normalizedUrl)) continue;
    removedPageCount += 1;
    changes.push(
      createChangeEvent({
        eventType: "page_removed",
        entityType: "page",
        url: previous.url,
        previousValue: { pageType: previous.pageType },
        message: "Page was present in the previous crawl but was not discovered during this crawl.",
      })
    );
  }

  return { changes, newPageCount, removedPageCount, changedPageCount: changedUrls.size };
}
