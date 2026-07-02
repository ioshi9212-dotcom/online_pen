"use server";

import { isAdmin } from "@/lib/admin";
import { getBookingConflictReasons, isActiveBookingStatus } from "@/lib/bookingConflicts";
import { safeDuration } from "@/lib/durations";
import { prisma } from "@/lib/prisma";
import { businessDateTimeFromKeyAndTime } from "@/lib/timezone";
import { redirect } from "next/navigation";

const BOOKING_STATUSES = new Set(["PENDING", "CONFIRMED", "CANCELLED_BY_CLIENT", "CANCELLED_BY_ADMIN", "REJECTED", "COMPLETED", "NO_SHOW"]);

function guard() {
  if (!isAdmin()) redirect("/admin/login");
}

function s(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function dateTime(formData: FormData, key: string) {
  const value = s(formData, key);
  const [datePart, timePart = "00:00"] = value.split("T");
  return businessDateTimeFromKeyAndTime(datePart, timePart);
}

function nullablePrice(formData: FormData) {
  const raw = s(formData, "finalPrice");
  return raw ? Number(raw) : null;
}

function editUrl(id: string, params: Record<string, string | undefined> = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const query = search.toString();
  return query ? `/admin/bookings/${id}/edit?${query}` : `/admin/bookings/${id}/edit`;
}

export async function updateBooking(formData: FormData) {
  guard();

  const id = s(formData, "id");
  const clientId = s(formData, "clientId");
  const serviceId = s(formData, "serviceId");
  const status = s(formData, "status") || "CONFIRMED";

  if (!BOOKING_STATUSES.has(status)) redirect(editUrl(id, { error: "Неизвестный статус записи" }));

  const [current, service] = await Promise.all([
    prisma.booking.findUnique({ where: { id } }),
    prisma.service.findUnique({ where: { id: serviceId } })
  ]);

  if (!current) redirect("/admin/bookings");
  if (!service) redirect(editUrl(id, { error: "Услуга не найдена" }));

  const startAt = dateTime(formData, "startAt");
  const durationMinutes = safeDuration(formData.get("durationMinutes"), service.durationMinutes || 150);
  const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);

  if (isActiveBookingStatus(status)) {
    if (startAt <= new Date()) redirect(editUrl(id, { error: "Нельзя оставить активную запись в прошлом. Завершите, отмените или выберите будущее время" }));

    const reasons = await getBookingConflictReasons({ startAt, endAt, ignoreBookingId: id });
    if (reasons.length) redirect(editUrl(id, { error: reasons.join("; ") }));
  }

  await prisma.booking.update({
    where: { id },
    data: {
      clientId,
      serviceId,
      startAt,
      endAt,
      status: status as any,
      clientComment: s(formData, "clientComment"),
      adminComment: s(formData, "adminComment"),
      finalPrice: nullablePrice(formData),
      confirmedAt: status === "CONFIRMED" ? current.confirmedAt ?? new Date() : current.confirmedAt,
      cancelledAt: status === "CANCELLED_BY_ADMIN" || status === "REJECTED" || status === "CANCELLED_BY_CLIENT" ? current.cancelledAt ?? new Date() : current.cancelledAt
    }
  });

  redirect(editUrl(id, { saved: "1" }));
}
