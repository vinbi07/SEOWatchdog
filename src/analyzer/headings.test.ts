import * as cheerio from "cheerio";
import { describe, expect, it } from "vitest";
import { countHeadingsByLevel, extractAllHeadings } from "./headings.js";

describe("extractAllHeadings", () => {
  it("captures all heading levels in document order", () => {
    const $ = cheerio.load("<html><body><h1>Title</h1><h2>Section</h2><h3>Sub</h3></body></html>");
    const headings = extractAllHeadings($);
    expect(headings).toEqual([
      { level: 1, text: "Title" },
      { level: 2, text: "Section" },
      { level: 3, text: "Sub" },
    ]);
  });

  it("drops empty/whitespace-only headings", () => {
    const $ = cheerio.load("<html><body><h1>  </h1><h2>Real Heading</h2></body></html>");
    expect(extractAllHeadings($)).toEqual([{ level: 2, text: "Real Heading" }]);
  });

  it("collapses internal whitespace in heading text", () => {
    const $ = cheerio.load("<html><body><h1>  The   Sickest \n Podcast </h1></body></html>");
    expect(extractAllHeadings($)[0]?.text).toBe("The Sickest Podcast");
  });
});

describe("countHeadingsByLevel", () => {
  it("tallies counts per level", () => {
    const counts = countHeadingsByLevel([
      { level: 1, text: "A" },
      { level: 2, text: "B" },
      { level: 2, text: "C" },
      { level: 3, text: "D" },
    ]);
    expect(counts).toEqual({ h1Count: 1, h2Count: 2, h3Count: 1, h4Count: 0, h5Count: 0, h6Count: 0 });
  });
});
