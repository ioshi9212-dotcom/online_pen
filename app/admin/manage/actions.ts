"use server";

import { isAdmin } from "@/lib/admin";
import { getBookingConflictReasons, isActiveBookingStatus } from "@/lib/bookingConflicts";
import { upsertManualClient } from "@/lib/clientSync";
import { safeDuration } from "@/lib/durations";
import { normalizePhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { businessDateTimeFromKeyAndTime } from "@/lib/timezone";
import { redirect } from "next/navigation";

function guard() {
  if (!isAdmin()) redirect("/admin/login");
}

function s(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function phone(formData: FormData) {
  return normalizePhone(s(formData, "phone"));
}

function dateOnly(formData: FormData, key: string) {
  return new Date(`${s(formData, key)}T00:00:00.000Z`);
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

function manageUrl(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const query = search.toString();
  return query ? `/admin/manage?${query}` : "/admin/manage";
}

export async function createManualClient(formData: FormData) {
  guard();
  const status = s(formData, "status") || "APPROVED";

  const result = await upsertManualClient({
    firstName: s(formData, "firstName"),
    lastName: s(formData, "lastName"),
    phone: phone(formData),
    birthDate: dateOnly(formData, "birthDate"),
    status,
    notes: s(formData, "notes")
  });

  redirect(manageUrl({ client: result.mode, clientId: result.client.id }));
}

export async function createManualBooking(formData: FormData) {
  guard();
  const clientId = s(formData, "clientId");
  const serviceId = s(formData, "serviceId");
  const service = await prisma.service.findUniqueOrThrow({ where: { id: serviceId } });
  const startAt = dateTime(formData, "startAt");
  const durationMinutes = safeDuration(formData.get("durationMinutes"), service.durationMinutes || 150);
  const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);
  const status = s(formData, "status") || "CONFIRMED";

  if (isActiveBookingStatus(status)) {
    const reasons = await getBookingConflictReasons({ startAt, endAt });
    if (reasons.length) redirect(manageUrl({ bookingError: reasons.join("; "), clientId }));
  }

  await prisma.booking.create({
    data: {
      clientId,
      serviceId,
      startAt,
      endAt,
      status: status as any,
      clientComment: s(formData, "clientComment"),
      adminComment: s(formData, "adminComment"),
      finalPrice: nullablePrice(formData),
      confirmedAt: status === "CONFIRMED" ? new Date() : null,
      cancelledAt: status.includes("CANCELLED") || status === "REJECTED" ? new Date() : null
    }
  });

  redirect(manageUrl({ booking: "created", clientId }));
}
