"use server";

import { addBookingMark, canRememberBooking, MASTER_REMEMBER_MARK } from "@/lib/bookingRemember";
import { changeBookingStatus, BookingError } from "@/lib/bookings";
import { scheduleTransaction } from "@/lib/scheduleTransaction";
import { isAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { markClientCancelSeen } from "@/lib/cancellationNotice";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const BOOKING_STATUSES = new Set(["PENDING", "CONFIRMED", "CANCELLED_BY_CLIENT", "CANCELLED_BY_ADMIN", "REJECTED", "COMPLETED", "NO_SHOW"]);

async function guard() {
  if (!(await isAdmin())) redirect("/admin/login");
}

function getId(formData: FormData) {
  return String(formData.get("id") || "");
}

function redirectTarget(formData: FormData, fallback: string) {
  const value = String(formData.get("redirectTo") || "");
  return value.startsWith("/admin") ? value : fallback;
}

export async function approveClient(formData: FormData) {
  await guard();
  await prisma.client.update({ where: { id: getId(formData) }, data: { status: "APPROVED", approvedAt: new Date(), bannedAt: null } });
  redirect(redirectTarget(formData, "/admin"));
}

export async function rejectClient(formData: FormData) {
  await guard();
  await prisma.client.update({ where: { id: getId(formData) }, data: { status: "REJECTED", approvedAt: null, bannedAt: null } });
  redirect(redirectTarget(formData, "/admin"));
}

export async function banClient(formData: FormData) {
  await guard();
  await prisma.client.update({ where: { id: getId(formData) }, data: { status: "BANNED", bannedAt: new Date() } });
  redirect("/admin/my-clients");
}

export async function unbanClient(formData: FormData) {
  await guard();
  await prisma.client.update({ where: { id: getId(formData) }, data: { status: "APPROVED", approvedAt: new Date(), bannedAt: null } });
  redirect("/admin/blacklist");
}

export async function setBookingStatus(formData: FormData) {
  await guard();
  const id = getId(formData);
  const status = String(formData.get("status"));
  const redirectTo = redirectTarget(formData, "/admin/bookings");
  if (!BOOKING_STATUSES.has(status)) redirect(redirectTo);

  try { await changeBookingStatus(id, status); }
  catch (error) {
    if (error instanceof BookingError) {
      const url = new URL(redirectTo, "https://local.invalid");
      url.searchParams.set("error", error.message);
      redirect(url.pathname + url.search + url.hash);
    }
    throw error;
  }

  revalidatePath("/admin");
  revalidatePath("/admin/bookings");
  revalidatePath("/admin/schedule");
  revalidatePath("/my");

  redirect(redirectTo);
}

export async function rememberMasterBooking(formData: FormData) {
  await guard();
  const id = getId(formData);
  const redirectTo = redirectTarget(formData, "/admin");
  const booking = await prisma.booking.findUnique({ where: { id }, select: { startAt: true, status: true, adminComment: true } });

  if (!booking || !["PENDING", "CONFIRMED"].includes(booking.status)) redirect(redirectTo);
  if (!canRememberBooking(booking.startAt)) redirect(redirectTo);

  await prisma.booking.update({
    where: { id },
    data: { adminComment: addBookingMark(booking.adminComment, MASTER_REMEMBER_MARK) }
  });

  redirect(redirectTo);
}

export async function acknowledgeClientCancellation(formData: FormData) {
  await guard();
  const id = getId(formData);
  const redirectTo = redirectTarget(formData, "/admin");
  const booking = await prisma.booking.findUnique({ where: { id }, select: { status: true, adminComment: true } });

  if (booking?.status === "CANCELLED_BY_CLIENT") {
    await prisma.booking.update({
      where: { id },
      data: { adminComment: markClientCancelSeen(booking.adminComment) }
    });
  }

  redirect(redirectTo);
}

export async function saveClientNote(formData: FormData) {
  await guard();
  const id = getId(formData);
  const notes = String(formData.get("notes") || "");
  await prisma.client.update({ where: { id }, data: { notes } });
  redirect("/admin/my-clients");
}

export async function closeWaitlistEntry(formData: FormData) {
  await guard();
  await prisma.waitlistEntry.update({
    where: { id: getId(formData) },
    data: { status: "CLOSED", closedAt: new Date() }
  });
  redirect(redirectTarget(formData, "/admin/waitlist"));
}

export async function createService(formData: FormData) {
  await guard();
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
  await guard();
  const id = getId(formData);
  const active = String(formData.get("active")) === "true";
  await prisma.service.update({ where: { id }, data: { isActive: active } });
  redirect("/admin/services");
}

export async function saveScheduleRule(formData: FormData) {
  await guard();
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
  await guard();
  const startAt = new Date(String(formData.get("startAt")));
  const endAt = new Date(String(formData.get("endAt")));
  const reason = String(formData.get("reason") || "");
  await scheduleTransaction(async (tx) => {
    if (!Number.isFinite(startAt.getTime()) || !Number.isFinite(endAt.getTime()) || endAt <= startAt) throw new BookingError("Проверьте время перерыва");
    const conflict = await tx.booking.findFirst({ where: { status: { in: ["PENDING", "CONFIRMED"] }, startAt: { lt: endAt }, endAt: { gt: startAt } } });
    if (conflict) throw new BookingError("В это время уже есть запись");
    await tx.blockedSlot.create({ data: { startAt, endAt, reason } });
    await tx.onlineWindow.deleteMany({ where: { startAt: { gte: startAt, lt: endAt } } });
  });
  redirect("/admin/schedule");
}

export async function deleteBlockedSlot(formData: FormData) {
  await guard();
  await scheduleTransaction((tx) => tx.blockedSlot.deleteMany({ where: { id: getId(formData) } }));
  redirect("/admin/schedule");
}
