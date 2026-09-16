import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  SITE_URL: z.string().url({ message: "SITE_URL must be a valid absolute URL, e.g. https://example.com" }),
  MAX_CONCURRENCY: z.coerce.number().int().positive().default(5),
  REQUEST_TIMEOUT: z.coerce.number().int().positive().default(10000),
  REQUEST_DELAY_MS: z.coerce.number().int().nonnegative().default(250),
  USER_AGENT: z.string().min(1).default("SEOWatchdogBot/0.1 (+https://github.com/your-org/seo-watchdog)"),
  MAX_PAGES: z.coerce.number().int().nonnegative().default(0),
  DISCOVER_INTERNAL_URLS: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  MAX_DISCOVERED_PAGES: z.coerce.number().int().nonnegative().default(100),
  MAX_CRAWL_DEPTH: z.coerce.number().int().nonnegative().default(3),
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(
      `Invalid environment configuration:\n${issues}\n\nCopy .env.example to .env and fill in the required values.`
    );
  }
  return parsed.data;
}

const env = loadEnv();

const siteUrl = new URL(env.SITE_URL);

export const config = {
  siteUrl: env.SITE_URL,
  siteOrigin: siteUrl.origin,
  siteHost: siteUrl.hostname,
  maxConcurrency: env.MAX_CONCURRENCY,
  requestTimeout: env.REQUEST_TIMEOUT,
  requestDelayMs: env.REQUEST_DELAY_MS,
  userAgent: env.USER_AGENT,
  maxPages: env.MAX_PAGES,
  discoverInternalUrls: env.DISCOVER_INTERNAL_URLS,
  maxDiscoveredPages: env.MAX_DISCOVERED_PAGES,
  maxCrawlDepth: env.MAX_CRAWL_DEPTH,
  outputDir: "output",
  outputFile: "output/latest-crawl.json",
} as const;
