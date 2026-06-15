"use server";

import { isAdmin } from "@/lib/admin";
import { cleanPhone, dateOnly, mergeClientIntoTarget, statusDates, upsertClientByPhone } from "@/lib/clientSync";
import { prisma } from "@/lib/prisma";
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
  return cleanPhone(s(formData, "phone"));
}

function dateTime(formData: FormData, key: string) {
  return new Date(s(formData, key));
}

function nullablePrice(formData: FormData) {
  const raw = s(formData, "finalPrice");
  return raw ? Number(raw) : null;
}

function manageUrl(done: string) {
  return `/admin/manage?done=${encodeURIComponent(done)}`;
}

export async function createManualClient(formData: FormData) {
  guard();

  const status = s(formData, "status") || "APPROVED";
  const clientPhone = phone(formData);
  const dates = statusDates(status);

  const result = await upsertClientByPhone({
    firstName: s(formData, "firstName"),
    lastName: s(formData, "lastName"),
    phone: clientPhone,
    birthDate: dateOnly(s(formData, "birthDate")),
    status: status as any,
    notes: s(formData, "notes"),
    approvedAt: dates.approvedAt,
    bannedAt: dates.bannedAt
  });

  redirect(manageUrl(result.mode === "created" ? "client-created" : "client-merged"));
}

export async function updateManualClient(formData: FormData) {
  guard();

  const clientId = id(formData);
  const status = s(formData, "status") || "APPROVED";
  const clientPhone = phone(formData);
  const current = await prisma.client.findUnique({ where: { id: clientId } });
  if (!current) redirect(manageUrl("client-not-found"));

  const existingByPhone = await prisma.client.findUnique({ where: { phone: clientPhone } });
  const dates = statusDates(status, current);
  const data = {
    firstName: s(formData, "firstName"),
    lastName: s(formData, "lastName"),
    phone: clientPhone,
    birthDate: dateOnly(s(formData, "birthDate")),
    status: status as any,
    notes: s(formData, "notes"),
    approvedAt: dates.approvedAt,
    bannedAt: dates.bannedAt
  };

  if (existingByPhone && existingByPhone.id !== clientId) {
    await mergeClientIntoTarget(existingByPhone.id, clientId, data);
    redirect(manageUrl("client-merged"));
  }

  await prisma.client.update({ where: { id: clientId }, data });
  redirect(manageUrl("client-saved"));
}

export async function createManualBooking(formData: FormData) {
  guard();
  const serviceId = s(formData, "serviceId");
  const service = await prisma.service.findUniqueOrThrow({ where: { id: serviceId } });
  const startAt = dateTime(formData, "startAt");
  const endAt = new Date(startAt.getTime() + service.durationMinutes * 60_000);
  const status = s(formData, "status") || "CONFIRMED";

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

  redirect(manageUrl("booking-created"));
}

export async function updateManualBooking(formData: FormData) {
  guard();
  const serviceId = s(formData, "serviceId");
  const service = await prisma.service.findUniqueOrThrow({ where: { id: serviceId } });
  const startAt = dateTime(formData, "startAt");
  const endAt = new Date(startAt.getTime() + service.durationMinutes * 60_000);
  const status = s(formData, "status") || "CONFIRMED";

  await prisma.booking.update({
    where: { id: id(formData) },
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

  redirect(manageUrl("booking-saved"));
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

  redirect(manageUrl("booking-cancelled"));
}
