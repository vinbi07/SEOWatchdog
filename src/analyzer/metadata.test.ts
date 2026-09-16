import * as cheerio from "cheerio";
import { describe, expect, it } from "vitest";
import {
  extractCanonical,
  extractHeadings,
  extractImageStats,
  extractMetaDescription,
  extractRobotsMeta,
  extractTitle,
} from "./metadata.js";

describe("extractTitle", () => {
  it("returns the trimmed title text", () => {
    const $ = cheerio.load("<html><head><title>  Hello World  </title></head></html>");
    expect(extractTitle($)).toBe("Hello World");
  });

  it("returns null when no title tag exists", () => {
    const $ = cheerio.load("<html><head></head></html>");
    expect(extractTitle($)).toBeNull();
  });
});

describe("extractMetaDescription", () => {
  it("extracts the description meta content", () => {
    const $ = cheerio.load('<html><head><meta name="description" content="A great page"></head></html>');
    expect(extractMetaDescription($)).toBe("A great page");
  });

  it("returns null when missing", () => {
    const $ = cheerio.load("<html><head></head></html>");
    expect(extractMetaDescription($)).toBeNull();
  });
});

describe("extractCanonical", () => {
  it("extracts the canonical href", () => {
    const $ = cheerio.load('<html><head><link rel="canonical" href="https://example.com/page"></head></html>');
    expect(extractCanonical($)).toBe("https://example.com/page");
  });

  it("returns null when missing", () => {
    const $ = cheerio.load("<html><head></head></html>");
    expect(extractCanonical($)).toBeNull();
  });
});

describe("extractRobotsMeta", () => {
  it("detects noindex directive", () => {
    const $ = cheerio.load('<html><head><meta name="robots" content="noindex, follow"></head></html>');
    const result = extractRobotsMeta($);
    expect(result.noindex).toBe(true);
    expect(result.nofollow).toBe(false);
  });

  it("defaults to indexable when no robots meta present", () => {
    const $ = cheerio.load("<html><head></head></html>");
    const result = extractRobotsMeta($);
    expect(result.noindex).toBe(false);
    expect(result.raw).toBeNull();
  });
});

describe("extractHeadings", () => {
  it("counts H1 and H2 elements and captures H1 text", () => {
    const $ = cheerio.load("<html><body><h1>Main</h1><h2>Sub</h2><h2>Sub 2</h2></body></html>");
    const result = extractHeadings($);
    expect(result.h1).toEqual(["Main"]);
    expect(result.h1Count).toBe(1);
    expect(result.h2Count).toBe(2);
  });

  it("detects multiple H1s", () => {
    const $ = cheerio.load("<html><body><h1>One</h1><h1>Two</h1></body></html>");
    expect(extractHeadings($).h1Count).toBe(2);
  });
});

describe("extractImageStats", () => {
  it("counts images missing alt attributes", () => {
    const $ = cheerio.load(
      '<html><body><img src="a.jpg" alt="A"><img src="b.jpg"><img src="c.jpg" alt=""></body></html>'
    );
    const result = extractImageStats($);
    expect(result.total).toBe(3);
    expect(result.missingAlt).toBe(2);
  });
});
