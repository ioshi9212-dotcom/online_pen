import { addBusinessDays, businessDateKey, businessDateTimeFromKeyAndTime, formatInBusinessTime } from "@/lib/timezone";

export const CLIENT_REMEMBER_MARK = "[client_remembered]";
export const MASTER_REMEMBER_MARK = "[master_remembered]";

export function hasBookingMark(value: string | null | undefined, mark: string) {
  return String(value || "").includes(mark);
}

export function addBookingMark(value: string | null | undefined, mark: string) {
  const text = String(value || "").trim();
  if (text.includes(mark)) return text;
  return text ? `${text}\n${mark}` : mark;
}

export function stripBookingMarks(value: string | null | undefined) {
  return String(value || "")
    .replaceAll(CLIENT_REMEMBER_MARK, "")
    .replaceAll(MASTER_REMEMBER_MARK, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function rememberOpenAt(startAt: Date) {
  const bookingKey = businessDateKey(startAt);
  const previousDayKey = addBusinessDays(bookingKey, -1);
  return businessDateTimeFromKeyAndTime(previousDayKey, "09:00");
}

export function canRememberBooking(startAt: Date, now = new Date()) {
  const opensAt = rememberOpenAt(startAt);
  return now >= opensAt && now < startAt;
}

export function rememberOpensLabel(startAt: Date) {
  return formatInBusinessTime(rememberOpenAt(startAt), {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit"
  });
}
