import { BookingStatus } from "@prisma/client";
import { getBookingConflictReasons, isActiveBookingStatus } from "@/lib/bookingConflicts";
import { scheduleTransaction, type ScheduleTx } from "@/lib/scheduleTransaction";
import { getOnlineBookingMinStart } from "@/lib/onlineBookingCutoff";
import { getEffectiveDay } from "@/lib/schedule";
import { businessDateKey, businessDateFromKey, businessDateTimeFromKeyAndTime, addBusinessDays } from "@/lib/timezone";

export class BookingError extends Error {}

export function validateInterval(startAt: Date, endAt: Date) {
  if (!Number.isFinite(startAt.getTime()) || !Number.isFinite(endAt.getTime()) || endAt <= startAt || endAt.getTime() - startAt.getTime() > 8 * 60 * 60_000) {
    throw new BookingError("Проверьте время и длительность записи");
  }
}

async function ensureFree(tx: ScheduleTx, startAt: Date, endAt: Date, ignoreBookingId?: string) {
  validateInterval(startAt, endAt);
  const reasons = await getBookingConflictReasons({ startAt, endAt, ignoreBookingId }, tx);
  if (reasons.length) throw new BookingError(reasons.join("; "));
}

export async function restoreWindow(tx: ScheduleTx, booking: { id: string; startAt: Date; endAt: Date }) {
  if (booking.startAt <= new Date()) return;
  const key = businessDateKey(booking.startAt);
  const [rules, overrides] = await Promise.all([tx.scheduleRule.findMany(), tx.dayOverride.findMany({ where: { date: { gte: businessDateFromKey(key), lt: businessDateFromKey(addBusinessDays(key, 1)) } } })]);
  const day = getEffectiveDay(booking.startAt, rules, overrides);
  if (!day.isWorkingDay || booking.startAt < businessDateTimeFromKeyAndTime(key, day.startTime) || booking.endAt > businessDateTimeFromKeyAndTime(key, day.endTime)) return;
  if ((await getBookingConflictReasons({ startAt: booking.startAt, endAt: booking.endAt, ignoreBookingId: booking.id }, tx)).length) return;
  await tx.onlineWindow.upsert({ where: { startAt: booking.startAt }, create: { startAt: booking.startAt, note: "Освободилось после отмены или переноса" }, update: {} });
}

type AdminBookingInput = {
  id?: string;
  clientId: string;
  serviceId: string;
  startAt: Date;
  durationMinutes: number;
  status: string;
  finalPrice: number | null;
  clientComment?: string;
  adminComment?: string;
};

export async function saveAdminBooking(input: AdminBookingInput) {
  return scheduleTransaction(async (tx) => {
    if (!Object.values(BookingStatus).includes(input.status as BookingStatus)) throw new BookingError("Неизвестный статус записи");
    const service = await tx.service.findUnique({ where: { id: input.serviceId } });
    const client = await tx.client.findUnique({ where: { id: input.clientId } });
    if (!service || !client) throw new BookingError("Клиент или услуга не найдены");
    if (!input.id && !service.isActive) throw new BookingError("Услуга выключена");
    const current = input.id ? await tx.booking.findUnique({ where: { id: input.id } }) : null;
    if (input.id && !current) throw new BookingError("Запись не найдена");
    const endAt = new Date(input.startAt.getTime() + input.durationMinutes * 60_000);
    validateInterval(input.startAt, endAt);
    const finalPrice = input.finalPrice ?? (current?.serviceId === service.id ? current.finalPrice : null) ?? service.price;
    if (!Number.isInteger(finalPrice) || finalPrice < 0) throw new BookingError("Проверьте стоимость");
    if (isActiveBookingStatus(input.status)) {
      if (input.startAt <= new Date() && (!current || !isActiveBookingStatus(current.status) || current.startAt.getTime() !== input.startAt.getTime())) throw new BookingError("Выберите будущее время");
      await ensureFree(tx, input.startAt, endAt, input.id);
    }
    const data = {
      clientId: client.id, serviceId: service.id, startAt: input.startAt, endAt,
      status: input.status as BookingStatus, finalPrice,
      clientComment: input.clientComment ?? current?.clientComment ?? "",
      adminComment: input.adminComment ?? current?.adminComment ?? "",
      confirmedAt: input.status === "CONFIRMED" ? current?.confirmedAt ?? new Date() : current?.confirmedAt,
      cancelledAt: isActiveBookingStatus(input.status) ? null : input.status.includes("CANCELLED") || input.status === "REJECTED" ? current?.cancelledAt ?? new Date() : current?.cancelledAt
    };
    const booking = input.id ? await tx.booking.update({ where: { id: input.id }, data }) : await tx.booking.create({ data });
    if (isActiveBookingStatus(booking.status)) await tx.onlineWindow.deleteMany({ where: { startAt: { gte: booking.startAt, lt: booking.endAt } } });
    if (current && isActiveBookingStatus(current.status) && (!isActiveBookingStatus(booking.status) || current.startAt.getTime() !== booking.startAt.getTime())) await restoreWindow(tx, current);
    return booking;
  });
}

export async function changeBookingStatus(id: string, status: string) {
  return scheduleTransaction(async (tx) => {
    if (!Object.values(BookingStatus).includes(status as BookingStatus)) throw new BookingError("Неизвестный статус записи");
    const current = await tx.booking.findUnique({ where: { id } });
    if (!current) throw new BookingError("Запись не найдена");
    if (isActiveBookingStatus(status)) {
      if (current.startAt <= new Date() && !isActiveBookingStatus(current.status)) throw new BookingError("Нельзя восстановить запись в прошлом");
      await ensureFree(tx, current.startAt, current.endAt, id);
    }
    const booking = await tx.booking.update({ where: { id }, data: {
      status: status as BookingStatus,
      confirmedAt: status === "CONFIRMED" ? current.confirmedAt ?? new Date() : current.confirmedAt,
      cancelledAt: isActiveBookingStatus(status) ? null : status.includes("CANCELLED") || status === "REJECTED" ? new Date() : current.cancelledAt
    } });
    if (isActiveBookingStatus(status)) await tx.onlineWindow.deleteMany({ where: { startAt: { gte: booking.startAt, lt: booking.endAt } } });
    else if (isActiveBookingStatus(current.status)) await restoreWindow(tx, current);
    return booking;
  });
}

export async function bookOnline(input: { clientId: string; serviceId: string; startAt: Date; comment: string; rescheduleId?: string }) {
  return scheduleTransaction(async (tx) => {
    const client = await tx.client.findUnique({ where: { id: input.clientId } });
    const service = await tx.service.findUnique({ where: { id: input.serviceId } });
    if (client?.status !== "APPROVED" || !service?.isActive || !service.showInBooking) throw new BookingError("SERVICE_UNAVAILABLE");
    const settings = await tx.setting.findMany();
    if (!Number.isFinite(input.startAt.getTime()) || input.startAt < getOnlineBookingMinStart(settings)) throw new BookingError("WINDOW_BUSY");
    const old = input.rescheduleId ? await tx.booking.findFirst({ where: { id: input.rescheduleId, clientId: client.id, status: { in: ["PENDING", "CONFIRMED"] }, startAt: { gt: new Date() } } }) : null;
    if (input.rescheduleId && !old) throw new BookingError("RESCHEDULE_UNAVAILABLE");
    if (!(await tx.onlineWindow.findUnique({ where: { startAt: input.startAt } }))) throw new BookingError("WINDOW_BUSY");
    const endAt = new Date(input.startAt.getTime() + service.durationMinutes * 60_000);
    const key = businessDateKey(input.startAt);
    const [rules, overrides] = await Promise.all([tx.scheduleRule.findMany(), tx.dayOverride.findMany({ where: { date: { gte: businessDateFromKey(key), lt: businessDateFromKey(addBusinessDays(key, 1)) } } })]);
    const day = getEffectiveDay(input.startAt, rules, overrides);
    if (!day.isWorkingDay || input.startAt < businessDateTimeFromKeyAndTime(key, day.startTime) || endAt > businessDateTimeFromKeyAndTime(key, day.endTime)) throw new BookingError("WINDOW_BUSY");
    await ensureFree(tx, input.startAt, endAt, old?.id);
    const booking = await tx.booking.create({ data: {
      clientId: client.id, serviceId: service.id, startAt: input.startAt, endAt,
      clientComment: input.comment, finalPrice: service.price, status: "PENDING"
    } });
    await tx.onlineWindow.deleteMany({ where: { startAt: { gte: booking.startAt, lt: booking.endAt } } });
    if (old) {
      await tx.booking.update({ where: { id: old.id }, data: { status: "CANCELLED_BY_CLIENT", cancelledAt: new Date() } });
      await restoreWindow(tx, old);
    }
    return booking;
  });
}

export async function cancelOnlineBooking(clientId: string, id: string) {
  return scheduleTransaction(async (tx) => {
    const booking = await tx.booking.findFirst({ where: { id, clientId, status: { in: ["PENDING", "CONFIRMED"] }, startAt: { gt: new Date() } } });
    if (!booking) return;
    await tx.booking.update({ where: { id }, data: { status: "CANCELLED_BY_CLIENT", cancelledAt: new Date() } });
    await restoreWindow(tx, booking);
  });
}
