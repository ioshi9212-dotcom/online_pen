import { Booking, BlockedSlot, DayOverride, ScheduleRule, Service, Setting } from "@prisma/client";
import { businessDateFromKey, businessDateKey, businessDateTimeFromKeyAndTime } from "./timezone";

type BusyBooking = Pick<Booking, "startAt" | "endAt">;
type BusyBlock = Pick<BlockedSlot, "startAt" | "endAt">;
type DayOverrideLite = Pick<DayOverride, "date" | "kind" | "startTime" | "endTime" | "note">;

export type EffectiveDay = {
  isWorkingDay: boolean;
  startTime: string;
  endTime: string;
  kind: "WORKING" | "DAY_OFF" | "SPECIAL" | "REGULAR";
  note: string;
  source: "weekly" | "override" | "default";
};

export function parseMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function formatMinutes(total: number) {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function dateKey(date: Date) {
  return businessDateKey(date);
}

export function dateFromKey(key: string) {
  return businessDateFromKey(key);
}

export function withMinutes(base: Date, minutesFromStart: number) {
  return businessDateTimeFromKeyAndTime(dateKey(base), formatMinutes(minutesFromStart));
}

export function combineDateAndTime(date: Date, time: string) {
  return businessDateTimeFromKeyAndTime(dateKey(date), time);
}

export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && aEnd > bStart;
}

export function getSettingInt(settings: Setting[], key: string, fallback: number) {
  const value = settings.find((item) => item.key === key)?.value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getEffectiveDay(date: Date, rules: ScheduleRule[], dayOverrides: DayOverrideLite[] = []): EffectiveDay {
  const weekday = date.getDay();
  const rule = rules.find((item) => item.weekday === weekday);
  const baseStart = rule?.startTime || "09:00";
  const baseEnd = rule?.endTime || "20:00";
  const baseWorking = rule?.isWorkingDay ?? false;
  const override = dayOverrides.find((item) => dateKey(item.date) === dateKey(date));

  if (!override) {
    return {
      isWorkingDay: baseWorking,
      startTime: baseStart,
      endTime: baseEnd,
      kind: "REGULAR",
      note: "",
      source: rule ? "weekly" : "default"
    };
  }

  if (override.kind === "DAY_OFF") {
    return {
      isWorkingDay: false,
      startTime: override.startTime || baseStart,
      endTime: override.endTime || baseEnd,
      kind: "DAY_OFF",
      note: override.note,
      source: "override"
    };
  }

  return {
    isWorkingDay: true,
    startTime: override.startTime || baseStart,
    endTime: override.endTime || baseEnd,
    kind: override.kind,
    note: override.note,
    source: "override"
  };
}

export function generateTimeList(startTime: string, endTime: string, stepMinutes: number) {
  const result: string[] = [];
  const start = parseMinutes(startTime);
  const end = parseMinutes(endTime);
  for (let minute = start; minute < end; minute += stepMinutes) {
    result.push(formatMinutes(minute));
  }
  return result;
}

export function getSlotState(params: {
  day: Date;
  time: string;
  durationMinutes: number;
  bookings: BusyBooking[];
  blockedSlots: BusyBlock[];
}) {
  const startAt = combineDateAndTime(params.day, params.time);
  const endAt = new Date(startAt.getTime() + params.durationMinutes * 60_000);
  const booked = params.bookings.some((booking) => overlaps(startAt, endAt, booking.startAt, booking.endAt));
  const blocked = params.blockedSlots.some((slot) => overlaps(startAt, endAt, slot.startAt, slot.endAt));
  if (booked) return "busy";
  if (blocked) return "blocked";
  return "free";
}

export function generateSlots(params: {
  service: Pick<Service, "durationMinutes">;
  rules: ScheduleRule[];
  bookings: BusyBooking[];
  blockedSlots: BusyBlock[];
  daysAhead: number;
  stepMinutes: number;
  dayOverrides?: DayOverrideLite[];
}) {
  const { service, rules, bookings, blockedSlots, daysAhead, stepMinutes, dayOverrides = [] } = params;
  const now = new Date();
  const result: { startAt: Date; endAt: Date }[] = [];

  for (let i = 0; i < daysAhead; i += 1) {
    const day = new Date(now);
    day.setDate(now.getDate() + i);
    day.setHours(0, 0, 0, 0);

    const effective = getEffectiveDay(day, rules, dayOverrides);
    if (!effective.isWorkingDay) continue;

    const workStart = parseMinutes(effective.startTime);
    const workEnd = parseMinutes(effective.endTime);

    for (let minute = workStart; minute + service.durationMinutes <= workEnd; minute += stepMinutes) {
      const startAt = withMinutes(day, minute);
      const endAt = new Date(startAt.getTime() + service.durationMinutes * 60_000);

      if (startAt <= now) continue;

      const booked = bookings.some((booking) => overlaps(startAt, endAt, booking.startAt, booking.endAt));
      const blocked = blockedSlots.some((slot) => overlaps(startAt, endAt, slot.startAt, slot.endAt));

      if (!booked && !blocked) result.push({ startAt, endAt });
    }
  }

  return result;
}
