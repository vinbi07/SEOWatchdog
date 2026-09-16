import type { CheerioAPI } from "cheerio";
import type { OpenGraphMeta, RobotsMeta, TwitterMeta } from "../types/seo.js";

function attr($: CheerioAPI, selector: string, attribute: string): string | null {
  const val = $(selector).first().attr(attribute);
  return val !== undefined && val.trim() !== "" ? val.trim() : null;
}

function metaContent($: CheerioAPI, name: string): string | null {
  const val =
    $(`meta[name="${name}" i]`).first().attr("content") ?? $(`meta[property="${name}" i]`).first().attr("content");
  return val !== undefined && val.trim() !== "" ? val.trim() : null;
}

export function extractTitle($: CheerioAPI): string | null {
  const text = $("title").first().text();
  const trimmed = text?.trim();
  return trimmed ? trimmed : null;
}

export function extractMetaDescription($: CheerioAPI): string | null {
  return metaContent($, "description");
}

export function extractCanonical($: CheerioAPI): string | null {
  return attr($, 'link[rel="canonical"]', "href");
}

export function extractRobotsMeta($: CheerioAPI): RobotsMeta {
  const raw = metaContent($, "robots");
  const lower = (raw ?? "").toLowerCase();
  return {
    raw,
    noindex: lower.includes("noindex"),
    nofollow: lower.includes("nofollow"),
  };
}

export function extractHeadings($: CheerioAPI): { h1: string[]; h1Count: number; h2Count: number } {
  const h1 = $("h1")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter((t) => t.length > 0);
  const h2Count = $("h2").length;
  return { h1, h1Count: $("h1").length, h2Count };
}

export function extractWordCount($: CheerioAPI): number {
  const clone = $("body").clone();
  clone.find("script, style, noscript, template").remove();
  const text = clone.text().replace(/\s+/g, " ").trim();
  if (!text) return 0;
  return text.split(" ").length;
}

export function extractOpenGraph($: CheerioAPI): OpenGraphMeta {
  return {
    title: metaContent($, "og:title"),
    description: metaContent($, "og:description"),
    image: metaContent($, "og:image"),
  };
}

export function extractTwitter($: CheerioAPI): TwitterMeta {
  return {
    card: metaContent($, "twitter:card"),
    title: metaContent($, "twitter:title"),
    description: metaContent($, "twitter:description"),
    image: metaContent($, "twitter:image"),
  };
}

export function extractLang($: CheerioAPI): string | null {
  const val = $("html").first().attr("lang");
  return val && val.trim() !== "" ? val.trim() : null;
}

export function extractHasViewport($: CheerioAPI): boolean {
  return $('meta[name="viewport" i]').length > 0;
}

export function extractHasFavicon($: CheerioAPI): boolean {
  return $('link[rel="icon" i], link[rel="shortcut icon" i], link[rel="apple-touch-icon" i]').length > 0;
}

export function extractImageStats($: CheerioAPI): { total: number; missingAlt: number } {
  const images = $("img");
  let missingAlt = 0;
  images.each((_, el) => {
    const alt = $(el).attr("alt");
    if (alt === undefined || alt.trim() === "") missingAlt += 1;
  });
  return { total: images.length, missingAlt };
}
