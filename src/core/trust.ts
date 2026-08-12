import type { KnowledgeActorEvent } from "./types.js";

const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/;
const instant = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/;
const nonEmpty = (value: unknown): string | undefined => typeof value === "string" && value.trim() ? value.trim() : undefined;

export function isIsoCalendarDate(value: unknown): value is string {
  const text = nonEmpty(value);
  const match = text?.match(dateOnly);
  if (!text || !match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function isIso8601Instant(value: unknown): value is string {
  const text = nonEmpty(value);
  const match = text?.match(instant);
  if (!text || !match) return false;
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[7] === undefined ? 0 : Number(match[7]);
  const offsetMinute = match[8] === undefined ? 0 : Number(match[8]);
  if (!isIsoCalendarDate(`${match[1]}-${match[2]}-${match[3]}`) || hour > 23 || minute > 59 || second > 59 || offsetHour > 23 || offsetMinute > 59) return false;
  return Number.isFinite(Date.parse(text));
}

export function latestVerification(verified: KnowledgeActorEvent[]): KnowledgeActorEvent | undefined {
  return [...verified].sort((left, right) => {
    const leftTime = left.at && isIso8601Instant(left.at) ? Date.parse(left.at) : Number.NEGATIVE_INFINITY;
    const rightTime = right.at && isIso8601Instant(right.at) ? Date.parse(right.at) : Number.NEGATIVE_INFINITY;
    return rightTime - leftTime || left.by.localeCompare(right.by);
  })[0];
}
