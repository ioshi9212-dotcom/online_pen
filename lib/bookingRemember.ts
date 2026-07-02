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

export function isBookingUpcoming(startAt: Date, now = new Date()) {
  return startAt > now;
}

export function canRememberBooking(startAt: Date, now = new Date()) {
  const opensAt = rememberOpenAt(startAt);
  return now >= opensAt && startAt > now;
}

export function rememberOpensLabel(startAt: Date) {
  return formatInBusinessTime(rememberOpenAt(startAt), {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function pluralRu(value: number, one: string, few: string, many: string) {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export function timeUntilBookingLabel(startAt: Date, now = new Date()) {
  const diffMs = startAt.getTime() - now.getTime();
  if (diffMs <= 0) return "Время записи уже прошло";

  const totalHours = Math.ceil(diffMs / 3_600_000);
  if (totalHours <= 1) return "До записи меньше часа";

  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const parts: string[] = [];

  if (days > 0) parts.push(`${days} ${pluralRu(days, "день", "дня", "дней")}`);
  if (hours > 0) parts.push(`${hours} ${pluralRu(hours, "час", "часа", "часов")}`);

  return `До записи ${parts.join(" ")}`;
}
