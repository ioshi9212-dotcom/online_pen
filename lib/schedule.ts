import { Booking, BlockedSlot, ScheduleRule, Service, Setting } from "@prisma/client";

type BusyBooking = Pick<Booking, "startAt" | "endAt">;
type BusyBlock = Pick<BlockedSlot, "startAt" | "endAt">;

function parseMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function withMinutes(base: Date, minutesFromStart: number) {
  const date = new Date(base);
  date.setHours(0, minutesFromStart, 0, 0);
  return date;
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && aEnd > bStart;
}

export function getSettingInt(settings: Setting[], key: string, fallback: number) {
  const value = settings.find((item) => item.key === key)?.value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function generateSlots(params: {
  service: Pick<Service, "durationMinutes">;
  rules: ScheduleRule[];
  bookings: BusyBooking[];
  blockedSlots: BusyBlock[];
  daysAhead: number;
  stepMinutes: number;
}) {
  const { service, rules, bookings, blockedSlots, daysAhead, stepMinutes } = params;
  const now = new Date();
  const result: { startAt: Date; endAt: Date }[] = [];

  for (let i = 0; i < daysAhead; i += 1) {
    const day = new Date(now);
    day.setDate(now.getDate() + i);
    day.setHours(0, 0, 0, 0);

    const weekday = day.getDay();
    const rule = rules.find((item) => item.weekday === weekday);
    if (!rule || !rule.isWorkingDay) continue;

    const workStart = parseMinutes(rule.startTime);
    const workEnd = parseMinutes(rule.endTime);

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
