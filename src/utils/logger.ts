/* eslint-disable no-console */
type Level = "info" | "warn" | "error" | "debug";

function timestamp(): string {
  return new Date().toISOString();
}

function log(level: Level, message: string, meta?: unknown): void {
  const prefix = `[${timestamp()}] [${level.toUpperCase()}]`;
  if (meta !== undefined) {
    console[level === "debug" ? "log" : level](prefix, message, meta);
  } else {
    console[level === "debug" ? "log" : level](prefix, message);
  }
}

export const logger = {
  info: (message: string, meta?: unknown) => log("info", message, meta),
  warn: (message: string, meta?: unknown) => log("warn", message, meta),
  error: (message: string, meta?: unknown) => log("error", message, meta),
  debug: (message: string, meta?: unknown) => {
    if (process.env.DEBUG) log("debug", message, meta);
  },
};
