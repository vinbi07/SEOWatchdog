import type { Severity } from "../types/seo.js";
import type { ChangeEvent, ChangeEventType } from "./types.js";

interface ChangeEventInput {
  eventType: ChangeEventType;
  entityType: ChangeEvent["entityType"];
  url?: string | null;
  issueKey?: string | null;
  severity?: Severity | null;
  fieldName?: string | null;
  previousValue?: unknown;
  currentValue?: unknown;
  message: string;
  metadata?: Record<string, unknown>;
}

export function createChangeEvent(input: ChangeEventInput): ChangeEvent {
  return {
    eventType: input.eventType,
    entityType: input.entityType,
    url: input.url ?? null,
    issueKey: input.issueKey ?? null,
    severity: input.severity ?? null,
    fieldName: input.fieldName ?? null,
    previousValue: input.previousValue ?? null,
    currentValue: input.currentValue ?? null,
    message: input.message,
    metadata: input.metadata ?? {},
  };
}
