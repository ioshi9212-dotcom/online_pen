import { scheduleTransaction } from "@/lib/scheduleTransaction";
import { businessDateFromKey, businessDateKey, businessDateTimeFromKeyAndTime, addBusinessDays } from "@/lib/timezone";
import { getEffectiveDay } from "@/lib/schedule";
import { validDateKey, validTime } from "@/lib/validation";

export class WindowError extends Error {}

export async function replaceOnlineWindows(date: string, input: unknown) {
  if (!validDateKey(date) || !Array.isArray(input) || input.length > 144 || input.some((time) => typeof time !== "string" || !validTime(time))) throw new WindowError("Проверьте дату и время окон");
  const times = Array.from(new Set(input as string[])).sort();
  const day = businessDateFromKey(date);
  const end = businessDateFromKey(addBusinessDays(date, 1));
  return scheduleTransaction(async (tx) => {
    const [rules, overrides] = await Promise.all([tx.scheduleRule.findMany(), tx.dayOverride.findMany({ where: { date: { gte: day, lt: end } } })]);
    const effective = getEffectiveDay(day, rules, overrides);
    if (times.length && !effective.isWorkingDay) throw new WindowError("Сначала отметьте день как рабочий");
    const now = new Date();
    const starts = times.map((time) => businessDateTimeFromKeyAndTime(date, time));
    if (times.some((time, i) => starts[i] <= now || businessDateKey(starts[i]) !== date || time < effective.startTime || time >= effective.endTime)) throw new WindowError("Выберите будущее время в рабочих часах дня");
    const [bookings, blocks] = await Promise.all([
      tx.booking.findMany({ where: { status: { in: ["PENDING", "CONFIRMED"] }, startAt: { lt: end }, endAt: { gt: day } } }),
      tx.blockedSlot.findMany({ where: { startAt: { lt: end }, endAt: { gt: day } } })
    ]);
    const savedTimes = times.filter((_, i) => ![...bookings, ...blocks].some((item) => item.startAt <= starts[i] && item.endAt > starts[i]));
    await tx.onlineWindow.deleteMany({ where: { startAt: { gte: day, lt: end } } });
    if (savedTimes.length) await tx.onlineWindow.createMany({ data: savedTimes.map((time) => ({ startAt: businessDateTimeFromKeyAndTime(date, time), note: "Открыто для онлайн-записи" })) });
    return { savedTimes, saved: savedTimes.length, skipped: times.length - savedTimes.length };
  });
}
