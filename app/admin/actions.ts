"use server";

import { isAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

function guard() {
  if (!isAdmin()) redirect("/admin/login");
}

function getId(formData: FormData) {
  return String(formData.get("id") || "");
}

function redirectTarget(formData: FormData, fallback: string) {
  const value = String(formData.get("redirectTo") || "");
  return value.startsWith("/admin") ? value : fallback;
}

export async function approveClient(formData: FormData) {
  guard();
  await prisma.client.update({ where: { id: getId(formData) }, data: { status: "APPROVED", approvedAt: new Date(), bannedAt: null } });
  redirect(redirectTarget(formData, "/admin"));
}

export async function rejectClient(formData: FormData) {
  guard();
  await prisma.client.update({ where: { id: getId(formData) }, data: { status: "REJECTED", approvedAt: null, bannedAt: null } });
  redirect(redirectTarget(formData, "/admin"));
}

export async function banClient(formData: FormData) {
  guard();
  await prisma.client.update({ where: { id: getId(formData) }, data: { status: "BANNED", bannedAt: new Date() } });
  redirect("/admin/my-clients");
}

export async function unbanClient(formData: FormData) {
  guard();
  await prisma.client.update({ where: { id: getId(formData) }, data: { status: "APPROVED", approvedAt: new Date(), bannedAt: null } });
  redirect("/admin/blacklist");
}

export async function setBookingStatus(formData: FormData) {
  guard();
  const id = getId(formData);
  const status = String(formData.get("status"));
  const redirectTo = redirectTarget(formData, "/admin/bookings");

  await prisma.booking.update({
    where: { id },
    data: {
      status: status as any,
      confirmedAt: status === "CONFIRMED" ? new Date() : undefined,
      cancelledAt: status === "CANCELLED_BY_ADMIN" || status === "REJECTED" ? new Date() : undefined
    }
  });
  redirect(redirectTo);
}

export async function saveClientNote(formData: FormData) {
  guard();
  const id = getId(formData);
  const notes = String(formData.get("notes") || "");
  await prisma.client.update({ where: { id }, data: { notes } });
  redirect("/admin/my-clients");
}

export async function closeWaitlistEntry(formData: FormData) {
  guard();
  await prisma.waitlistEntry.update({
    where: { id: getId(formData) },
    data: { status: "CLOSED", closedAt: new Date() }
  });
  redirect("/admin");
}

export async function createService(formData: FormData) {
  guard();
  await prisma.service.create({
    data: {
      title: String(formData.get("title") || ""),
      description: String(formData.get("description") || ""),
      durationMinutes: Number(formData.get("durationMinutes") || 120),
      price: Number(formData.get("price") || 0),
      sortOrder: Number(formData.get("sortOrder") || 100),
      isActive: true
    }
  });
  redirect("/admin/services");
}

export async function toggleService(formData: FormData) {
  guard();
  const id = getId(formData);
  const active = String(formData.get("active")) === "true";
  await prisma.service.update({ where: { id }, data: { isActive: active } });
  redirect("/admin/services");
}

export async function saveScheduleRule(formData: FormData) {
  guard();
  const weekday = Number(formData.get("weekday"));
  await prisma.scheduleRule.upsert({
    where: { weekday },
    create: {
      weekday,
      startTime: String(formData.get("startTime") || "09:00"),
      endTime: String(formData.get("endTime") || "20:00"),
      isWorkingDay: formData.get("isWorkingDay") === "on"
    },
    update: {
      startTime: String(formData.get("startTime") || "09:00"),
      endTime: String(formData.get("endTime") || "20:00"),
      isWorkingDay: formData.get("isWorkingDay") === "on"
    }
  });
  redirect("/admin/schedule");
}

export async function addBlockedSlot(formData: FormData) {
  guard();
  const startAt = new Date(String(formData.get("startAt")));
  const endAt = new Date(String(formData.get("endAt")));
  const reason = String(formData.get("reason") || "");
  await prisma.blockedSlot.create({ data: { startAt, endAt, reason } });
  redirect("/admin/schedule");
}

export async function deleteBlockedSlot(formData: FormData) {
  guard();
  await prisma.blockedSlot.delete({ where: { id: getId(formData) } });
  redirect("/admin/schedule");
}
