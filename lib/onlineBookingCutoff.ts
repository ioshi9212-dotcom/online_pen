import type { Setting } from "@prisma/client";
import { addBusinessDays, businessDateFromKey, todayBusinessDateKey } from "@/lib/timezone";

export const ONLINE_BOOKING_HIDE_DAYS_KEY = "ONLINE_BOOKING_HIDE_DAYS";

export function normalizeOnlineBookingHideDays(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return -1;
  if (parsed < -1) return -1;
  if (parsed > 3) return 3;
  return Math.trunc(parsed);
}

export function getOnlineBookingHideDays(settings: Pick<Setting, "key" | "value">[]) {
  const raw = settings.find((item) => item.key === ONLINE_BOOKING_HIDE_DAYS_KEY)?.value;
  return normalizeOnlineBookingHideDays(raw ?? -1);
}

export function getOnlineBookingMinStart(settings: Pick<Setting, "key" | "value">[], now = new Date()) {
  const hideDays = getOnlineBookingHideDays(settings);
  if (hideDays < 0) return now;
  const firstVisibleKey = addBusinessDays(todayBusinessDateKey(), hideDays + 1);
  return businessDateFromKey(firstVisibleKey);
}

export function onlineBookingHideDaysLabel(value: number) {
  if (value < 0) return "Не скрывать ближайшие дни";
  if (value === 0) return "Не показывать клиентам сегодня";
  if (value === 1) return "Не показывать клиентам сегодня и завтра";
  if (value === 2) return "Не показывать клиентам сегодня, завтра и ещё 2 дня";
  return "Не показывать клиентам сегодня, завтра и ещё 3 дня";
}
