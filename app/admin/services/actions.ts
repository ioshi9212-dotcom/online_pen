"use server";

import { isAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

function guard() {
  if (!isAdmin()) redirect("/admin/login");
}

function text(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim().replace(/\s+/g, " ");
}

function numberValue(formData: FormData, key: string, fallback: number) {
  const parsed = Number(formData.get(key));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function checkbox(formData: FormData, key: string, fallback = false) {
  return formData.has(key) ? formData.get(key) === "on" : fallback;
}

function servicesUrl(params: Record<string, string | number | boolean | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  return `/admin/services?${search.toString()}`;
}

async function findDuplicate(title: string, ignoreId?: string) {
  if (!title) return null;

  return prisma.service.findFirst({
    where: {
      title: { equals: title, mode: "insensitive" },
      ...(ignoreId ? { id: { not: ignoreId } } : {})
    },
    select: { id: true, title: true, isActive: true }
  });
}

export async function createService(formData: FormData) {
  guard();

  const title = text(formData, "title");
  if (!title) redirect(servicesUrl({ error: "empty-title", add: 1 }));

  const duplicate = await findDuplicate(title);
  if (duplicate) {
    redirect(servicesUrl({ duplicate: duplicate.id, title }));
  }

  const maxSort = await prisma.service.aggregate({ _max: { sortOrder: true } });
  const isActive = checkbox(formData, "isActive", true);

  const service = await prisma.service.create({
    data: {
      title,
      description: text(formData, "description"),
      durationMinutes: Math.max(1, numberValue(formData, "durationMinutes", 120)),
      price: Math.max(0, numberValue(formData, "price", 0)),
      sortOrder: (maxSort._max.sortOrder ?? 0) + 10,
      isActive,
      showInBooking: isActive ? checkbox(formData, "showInBooking", true) : false
    },
    select: { id: true }
  });

  redirect(servicesUrl({ created: service.id }));
}

export async function updateService(formData: FormData) {
  guard();

  const id = text(formData, "id");
  const title = text(formData, "title");
  if (!id) redirect(servicesUrl({ error: "missing-id" }));
  if (!title) redirect(servicesUrl({ error: "empty-title", edit: id }));

  const duplicate = await findDuplicate(title, id);
  if (duplicate) {
    redirect(servicesUrl({ duplicate: duplicate.id, title, edit: id }));
  }

  const isActive = formData.get("isActive") === "on";

  await prisma.service.update({
    where: { id },
    data: {
      title,
      description: text(formData, "description"),
      durationMinutes: Math.max(1, numberValue(formData, "durationMinutes", 120)),
      price: Math.max(0, numberValue(formData, "price", 0)),
      isActive,
      showInBooking: isActive ? formData.get("showInBooking") === "on" : false
    }
  });

  redirect(servicesUrl({ updated: id }));
}

export async function toggleService(formData: FormData) {
  guard();

  const id = text(formData, "id");
  const next = text(formData, "next") === "true";
  await prisma.service.update({ where: { id }, data: { isActive: next, ...(next ? {} : { showInBooking: false }) } });

  redirect(servicesUrl({ toggled: id, visible: next }));
}

export async function toggleBookingService(formData: FormData) {
  guard();

  const id = text(formData, "id");
  const next = text(formData, "next") === "true";
  await prisma.service.update({ where: { id }, data: { showInBooking: next, isActive: true } });

  redirect(servicesUrl({ booking: id, visible: next }));
}

export async function deleteService(formData: FormData) {
  guard();

  const id = text(formData, "id");
  const bookings = await prisma.booking.count({ where: { serviceId: id } });

  if (bookings > 0) {
    await prisma.service.update({ where: { id }, data: { isActive: false, showInBooking: false } });
    redirect(servicesUrl({ archived: id }));
  }

  await prisma.service.delete({ where: { id } });
  redirect(servicesUrl({ deleted: id }));
}

export async function moveService(formData: FormData) {
  guard();

  const id = text(formData, "id");
  const direction = text(formData, "direction");
  const service = await prisma.service.findUnique({ where: { id } });
  if (!service) redirect("/admin/services");

  await prisma.service.update({
    where: { id },
    data: { sortOrder: service.sortOrder + (direction === "up" ? -15 : 15) }
  });

  redirect(servicesUrl({ moved: id }));
}
