import * as cheerio from "cheerio";
import { describe, expect, it } from "vitest";
import { extractVisibleTextBlocks, findDuplicateVisibleContent } from "./duplicateContent.js";

describe("findDuplicateVisibleContent", () => {
  it("detects a long block of text repeated on the page", () => {
    const block = "Book Paden Sickles for your next corporate event or speaking engagement today.";
    const duplicates = findDuplicateVisibleContent([block, "Some other unique paragraph text here.", block]);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]?.occurrences).toBe(2);
  });

  it("ignores short labels/button text even if repeated many times", () => {
    const duplicates = findDuplicateVisibleContent(["Read More", "Read More", "Read More", "Read More"]);
    expect(duplicates).toHaveLength(0);
  });

  it("does not flag unique content", () => {
    const duplicates = findDuplicateVisibleContent([
      "This is the first unique paragraph on the page, long enough to matter.",
      "This is a completely different second paragraph, also long enough.",
    ]);
    expect(duplicates).toHaveLength(0);
  });
});

describe("extractVisibleTextBlocks", () => {
  it("excludes nav, header, and footer content", () => {
    const $ = cheerio.load(`
      <body>
        <header><nav><a href="/">Home</a><a href="/about">About</a></nav></header>
        <p>This is the unique main content paragraph of the page, long enough.</p>
        <footer><p>Copyright 2026 Example Inc. All rights reserved worldwide.</p></footer>
      </body>
    `);
    const blocks = extractVisibleTextBlocks($);
    expect(blocks.some((b) => b.includes("copyright"))).toBe(false);
    expect(blocks.some((b) => b.includes("unique main content"))).toBe(true);
  });

  it("collects text from paragraphs, list items, and headings", () => {
    const $ = cheerio.load(`
      <body>
        <h2>Section Title</h2>
        <p>A paragraph.</p>
        <ul><li>A list item.</li></ul>
      </body>
    `);
    const blocks = extractVisibleTextBlocks($);
    expect(blocks).toEqual(["section title", "a paragraph.", "a list item."]);
  });
});
