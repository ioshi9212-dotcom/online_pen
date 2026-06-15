"use server";

import { isAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { getBookingConflictReasons, isActiveBookingStatus } from "@/lib/bookingConflicts";
import { saveAdminClient, upsertManualClient } from "@/lib/clientSync";
import { normalizePhone } from "@/lib/phone";
import { redirect } from "next/navigation";

function guard() {
  if (!isAdmin()) redirect("/admin/login");
}

function s(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function id(formData: FormData) {
  return s(formData, "id");
}

function phone(formData: FormData) {
  return normalizePhone(s(formData, "phone"));
}

function dateOnly(formData: FormData, key: string) {
  return new Date(`${s(formData, key)}T00:00:00.000Z`);
}

function dateTime(formData: FormData, key: string) {
  return new Date(s(formData, key));
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

  redirect(manageUrl({ client: result.mode }));
}

export async function updateManualClient(formData: FormData) {
  guard();
  const status = s(formData, "status") || "APPROVED";

  const result = await saveAdminClient({
    id: id(formData),
    firstName: s(formData, "firstName"),
    lastName: s(formData, "lastName"),
    phone: phone(formData),
    birthDate: dateOnly(formData, "birthDate"),
    status,
    notes: s(formData, "notes")
  });

  redirect(manageUrl({ client: result.mode }));
}

export async function createManualBooking(formData: FormData) {
  guard();
  const serviceId = s(formData, "serviceId");
  const service = await prisma.service.findUniqueOrThrow({ where: { id: serviceId } });
  const startAt = dateTime(formData, "startAt");
  const endAt = new Date(startAt.getTime() + service.durationMinutes * 60_000);
  const status = s(formData, "status") || "CONFIRMED";

  if (isActiveBookingStatus(status)) {
    const reasons = await getBookingConflictReasons({ startAt, endAt });
    if (reasons.length) redirect(manageUrl({ bookingError: reasons.join("; ") }));
  }

  await prisma.booking.create({
    data: {
      clientId: s(formData, "clientId"),
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

  redirect(manageUrl({ booking: "created" }));
}

export async function updateManualBooking(formData: FormData) {
  guard();
  const bookingId = id(formData);
  const serviceId = s(formData, "serviceId");
  const service = await prisma.service.findUniqueOrThrow({ where: { id: serviceId } });
  const startAt = dateTime(formData, "startAt");
  const endAt = new Date(startAt.getTime() + service.durationMinutes * 60_000);
  const status = s(formData, "status") || "CONFIRMED";

  if (isActiveBookingStatus(status)) {
    const reasons = await getBookingConflictReasons({ startAt, endAt, ignoreBookingId: bookingId });
    if (reasons.length) redirect(manageUrl({ bookingError: reasons.join("; ") }));
  }

  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      clientId: s(formData, "clientId"),
      serviceId,
      startAt,
      endAt,
      status: status as any,
      clientComment: s(formData, "clientComment"),
      adminComment: s(formData, "adminComment"),
      finalPrice: nullablePrice(formData),
      confirmedAt: status === "CONFIRMED" ? new Date() : undefined,
      cancelledAt: status.includes("CANCELLED") || status === "REJECTED" ? new Date() : undefined
    }
  });

  redirect(manageUrl({ booking: "saved" }));
}

export async function cancelManualBooking(formData: FormData) {
  guard();

  await prisma.booking.update({
    where: { id: id(formData) },
    data: {
      status: "CANCELLED_BY_ADMIN",
      cancelledAt: new Date()
    }
  });

  redirect(manageUrl({ booking: "cancelled" }));
}
