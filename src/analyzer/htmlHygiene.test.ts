import * as cheerio from "cheerio";
import { describe, expect, it } from "vitest";
import { extractCharset, hasHtml5Doctype } from "./htmlHygiene.js";

describe("extractCharset", () => {
  it("reads a <meta charset> tag", () => {
    const $ = cheerio.load(`<html><head><meta charset="UTF-8"></head></html>`);
    expect(extractCharset($)).toBe("UTF-8");
  });

  it("reads the legacy http-equiv Content-Type form", () => {
    const $ = cheerio.load(`<html><head><meta http-equiv="Content-Type" content="text/html; charset=ISO-8859-1"></head></html>`);
    expect(extractCharset($)).toBe("ISO-8859-1");
  });

  it("returns null when no charset is declared", () => {
    const $ = cheerio.load(`<html><head><title>No charset</title></head></html>`);
    expect(extractCharset($)).toBeNull();
  });
});

describe("hasHtml5Doctype", () => {
  it("detects a standard HTML5 doctype", () => {
    expect(hasHtml5Doctype("<!doctype html>\n<html></html>")).toBe(true);
    expect(hasHtml5Doctype("<!DOCTYPE HTML>\n<html></html>")).toBe(true);
  });

  it("returns false when there is no doctype", () => {
    expect(hasHtml5Doctype("<html><head></head></html>")).toBe(false);
  });

  it("returns false for a legacy/XHTML doctype", () => {
    expect(hasHtml5Doctype('<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN">\n<html></html>')).toBe(false);
  });
});
