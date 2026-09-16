import type { PublicationState, StructuredDataDetail } from "../types/seo.js";

/**
 * Determines publication state from reliable evidence only — currently
 * `datePublished` in PodcastEpisode structured data. A future date means
 * "scheduled"; a past-or-present date means "published"; anything else
 * (no parseable evidence) stays "unknown" rather than being guessed.
 *
 * Never infers publication state from `noindex` or from the page simply
 * being linked/discovered.
 */
export function determinePublicationState(
  structuredDataDetails: StructuredDataDetail[],
  now: Date = new Date()
): PublicationState {
  const episode = structuredDataDetails.find((d) => d.type === "PodcastEpisode" && d.datePublished);
  if (!episode?.datePublished) return "unknown";

  const publishedAt = new Date(episode.datePublished);
  if (Number.isNaN(publishedAt.getTime())) return "unknown";

  return publishedAt.getTime() <= now.getTime() ? "published" : "scheduled";
}
