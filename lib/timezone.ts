export const BUSINESS_TIME_ZONE = "Asia/Vladivostok";
export const BUSINESS_UTC_OFFSET_MINUTES = 10 * 60;

type DateInput = Date | string;

function toDate(value: DateInput) {
  return typeof value === "string" ? new Date(value) : value;
}

function partsInBusinessZone(value: DateInput) {
  const date = toDate(value);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day)
  };
}

export function businessDateKey(value: DateInput) {
  const { year, month, day } = partsInBusinessZone(value);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function businessMonthKey(value: DateInput) {
  return businessDateKey(value).slice(0, 7);
}

export function parseDateKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return { year, month, day };
}

export function businessDateFromKey(key: string) {
  const { year, month, day } = parseDateKey(key);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0) - BUSINESS_UTC_OFFSET_MINUTES * 60_000);
}

export function businessDateTimeFromKeyAndTime(key: string, time: string) {
  const { year, month, day } = parseDateKey(key);
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hours || 0, minutes || 0, 0, 0) - BUSINESS_UTC_OFFSET_MINUTES * 60_000);
}

export function formatInBusinessTime(value: DateInput, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: BUSINESS_TIME_ZONE,
    ...options
  }).format(toDate(value));
}
