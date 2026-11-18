"use server";

import { validDateKey, validTime } from "@/lib/validation";
import { isAdmin } from "@/lib/admin";
import { saveAdminBooking, BookingError } from "@/lib/bookings";
import { safeDuration } from "@/lib/durations";
import { prisma } from "@/lib/prisma";
import { businessDateTimeFromKeyAndTime } from "@/lib/timezone";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const BOOKING_STATUSES = new Set(["PENDING", "CONFIRMED", "CANCELLED_BY_CLIENT", "CANCELLED_BY_ADMIN", "REJECTED", "COMPLETED", "NO_SHOW"]);

async function guard() {
  if (!(await isAdmin())) redirect("/admin/login");
}

function s(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function dateTime(formData: FormData) {
  const legacyValue = s(formData, "startAt");
  const [legacyDate, legacyTime = "00:00"] = legacyValue.split("T");
  const datePart = s(formData, "startDate") || legacyDate;
  const timePart = s(formData, "startTime") || legacyTime;
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

export async function updateBooking(_state: { error: string }, formData: FormData) {
  await guard();

  const id = s(formData, "id");
  const clientId = s(formData, "clientId");
  const serviceId = s(formData, "serviceId");
  const status = s(formData, "status") || "CONFIRMED";

  if (!BOOKING_STATUSES.has(status)) return { error: "Неизвестный статус записи" };

  const [current, service] = await Promise.all([
    prisma.booking.findUnique({ where: { id } }),
    prisma.service.findUnique({ where: { id: serviceId } })
  ]);

  if (!current) redirect("/admin/bookings");
  if (!service) return { error: "Услуга не найдена" };

  const [legacyDate, legacyTime] = s(formData, "startAt").split("T");
  if (!validDateKey(s(formData, "startDate") || legacyDate || "") || !validTime(s(formData, "startTime") || legacyTime || "")) return { error: "Проверьте дату и время" };
  const startAt = dateTime(formData);
  const durationMinutes = safeDuration(formData.get("durationMinutes"), service.durationMinutes || 150);

  try {
    await saveAdminBooking({ id, clientId, serviceId, startAt, durationMinutes, status,
      clientComment: s(formData, "clientComment"), adminComment: s(formData, "adminComment"), finalPrice: nullablePrice(formData) });
  } catch (error) {
    if (error instanceof BookingError) return { error: error.message };
    throw error;
  }

  revalidatePath("/admin");
  revalidatePath("/admin/bookings");
  revalidatePath(`/admin/bookings/${id}/edit`);
  revalidatePath("/admin/schedule");
  revalidatePath("/my");

  redirect(editUrl(id, { saved: "1" }));
}
