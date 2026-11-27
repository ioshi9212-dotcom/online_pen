/** A short announcement is readable inside the account even without Web Push. */
export const SCHEDULE_ANNOUNCEMENT_KEY = "schedule_broadcast_latest";
export const SCHEDULE_BROADCAST_COOLDOWN_MS = 5 * 60 * 1000;

export type ScheduleAnnouncement = { title: string; body: string; publishedAt: string };

export function parseScheduleMessage(input: unknown): { title: string; body: string } | null {
  if (!input || typeof input !== "object") return null;
  const value = input as { title?: unknown; body?: unknown };
  if (typeof value.title !== "string" || typeof value.body !== "string") return null;
  const title = value.title.replace(/\\s+/g, " ").trim();
  const body = value.body.replace(/\\s+/g, " ").trim();
  if (!title || title.length > 80 || body.length < 5 || body.length > 240) return null;
  return { title, body };
}

export function readScheduleAnnouncement(value: string | undefined): ScheduleAnnouncement | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    const message = parseScheduleMessage(parsed);
    const date = (parsed as { publishedAt?: unknown })?.publishedAt;
    if (!message || typeof date !== "string" || !Number.isFinite(Date.parse(date))) return null;
    return { ...message, publishedAt: date };
  } catch { return null; }
}
