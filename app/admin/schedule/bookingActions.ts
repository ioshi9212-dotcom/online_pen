"use server";

import { isAdmin } from "@/lib/admin";
import { getBookingConflictReasons, isActiveBookingStatus } from "@/lib/bookingConflicts";
import { safeDuration } from "@/lib/durations";
import { combineDateAndTime, dateFromKey } from "@/lib/schedule";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

const BOOKING_STATUSES = new Set(["PENDING", "CONFIRMED", "CANCELLED_BY_CLIENT", "CANCELLED_BY_ADMIN", "REJECTED", "COMPLETED", "NO_SHOW"]);

function guard() {
  if (!isAdmin()) redirect("/admin/login");
}

function text(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function back(formData: FormData, suffix = "") {
  const month = text(formData, "month");
  const date = text(formData, "date");
  return `/admin/schedule?view=calendar&month=${month}&date=${date}${suffix}#selected-day`;
}

export async function confirmScheduleBooking(formData: FormData) {
  guard();
  await prisma.booking.update({
    where: { id: text(formData, "id") },
    data: { status: "CONFIRMED", confirmedAt: new Date() }
  });
  redirect(back(formData, "&success=Запись подтверждена"));
}

export async function cancelScheduleBooking(formData: FormData) {
  guard();
  await prisma.booking.update({
    where: { id: text(formData, "id") },
    data: { status: "CANCELLED_BY_ADMIN", cancelledAt: new Date() }
  });
  redirect(back(formData, "&success=Запись отменена"));
}

export async function updateScheduleBooking(formData: FormData) {
  guard();

  const bookingId = text(formData, "id");
  const serviceId = text(formData, "serviceId");
  const service = await prisma.service.findUniqueOrThrow({ where: { id: serviceId } });
  const day = dateFromKey(text(formData, "date"));
  const startAt = combineDateAndTime(day, text(formData, "startTime"));
  const durationMinutes = safeDuration(formData.get("durationMinutes"), service.durationMinutes || 150);
  const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);
  const status = text(formData, "status") || "CONFIRMED";
  if (!BOOKING_STATUSES.has(status)) redirect(back(formData, "&warning=Некорректный статус записи"));

  if (isActiveBookingStatus(status)) {
    const reasons = await getBookingConflictReasons({ startAt, endAt, ignoreBookingId: bookingId });
    if (reasons.length) redirect(back(formData, `&warning=${encodeURIComponent(reasons.join("; "))}`));
  }

  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      clientId: text(formData, "clientId"),
      serviceId,
      startAt,
      endAt,
      status: status as any,
      finalPrice: text(formData, "finalPrice") ? Number(text(formData, "finalPrice")) : null,
      adminComment: text(formData, "adminComment"),
      confirmedAt: status === "CONFIRMED" ? new Date() : undefined,
      cancelledAt: status.includes("CANCELLED") || status === "REJECTED" ? new Date() : undefined
    }
  });

  redirect(back(formData, "&success=Запись сохранена"));
}
