import * as cheerio from "cheerio";
import { describe, expect, it } from "vitest";
import { findMixedContentUrls } from "./mixedContent.js";

describe("findMixedContentUrls", () => {
  it("detects an http:// script src on an https page", () => {
    const $ = cheerio.load(`<script src="http://insecure.example.com/lib.js"></script>`);
    expect(findMixedContentUrls($, true)).toContain("http://insecure.example.com/lib.js");
  });

  it("detects an http:// image src on an https page", () => {
    const $ = cheerio.load(`<img src="http://insecure.example.com/photo.jpg" />`);
    expect(findMixedContentUrls($, true)).toHaveLength(1);
  });

  it("does not flag https resources", () => {
    const $ = cheerio.load(`<script src="https://secure.example.com/lib.js"></script><img src="https://secure.example.com/a.jpg" />`);
    expect(findMixedContentUrls($, true)).toHaveLength(0);
  });

  it("does not flag relative resource URLs", () => {
    const $ = cheerio.load(`<img src="/images/photo.jpg" /><script src="/js/app.js"></script>`);
    expect(findMixedContentUrls($, true)).toHaveLength(0);
  });

  it("never checks when the page itself is not https", () => {
    const $ = cheerio.load(`<script src="http://insecure.example.com/lib.js"></script>`);
    expect(findMixedContentUrls($, false)).toHaveLength(0);
  });

  it("does not treat mailto/tel/data/blob as mixed content", () => {
    const $ = cheerio.load(`
      <a href="mailto:hi@example.com">Email</a>
      <img src="data:image/png;base64,iVBORw0KGgo=" />
    `);
    expect(findMixedContentUrls($, true)).toHaveLength(0);
  });
});
