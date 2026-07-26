"use server";

import { addBookingMark, canRememberBooking, MASTER_REMEMBER_MARK } from "@/lib/bookingRemember";
import { getBookingConflictReasons, isActiveBookingStatus } from "@/lib/bookingConflicts";
import { isAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { markClientCancelSeen } from "@/lib/cancellationNotice";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

const BOOKING_STATUSES = new Set(["PENDING", "CONFIRMED", "CANCELLED_BY_CLIENT", "CANCELLED_BY_ADMIN", "REJECTED", "COMPLETED", "NO_SHOW"]);

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

async function restoreOnlineWindowAfterAdminCancel(booking: { id: string; startAt: Date; endAt: Date }) {
  if (booking.startAt <= new Date()) return;

  const conflictReasons = await getBookingConflictReasons({ startAt: booking.startAt, endAt: booking.endAt, ignoreBookingId: booking.id });
  if (conflictReasons.length) return;

  await prisma.onlineWindow.upsert({
    where: { startAt: booking.startAt },
    create: { startAt: booking.startAt, note: "Возвращено после отмены записи мастером" },
    update: { note: "Возвращено после отмены записи мастером" }
  });
}

export async function approveClient(formData: FormData) {
  guard();
  await prisma.client.update({ where: { id: getId(formData) }, data: { status: "APPROVED", approvedAt: new Date(), bannedAt: null } });
  redirect(redirectTarget(formData, "/admin"));
}

export async function approveClientAndMessage(formData: FormData) {
  guard();
  const client = await prisma.client.update({
    where: { id: getId(formData) },
    data: { status: "APPROVED", approvedAt: new Date(), bannedAt: null },
    select: { firstName: true, phone: true }
  });

  const requestHeaders = headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "";
  const protocol = requestHeaders.get("x-forwarded-proto") || "https";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || (host ? `${protocol}://${host}` : "");
  const digits = client.phone.replace(/\D/g, "").replace(/^8(?=\d{10}$)/, "7");
  const message = [
    `${client.firstName}, доступ к онлайн-записи открыт.`,
    appUrl ? `Войдите по ссылке: ${appUrl}/login` : "Теперь можно войти на сайт и выбрать время.",
    "Для входа понадобятся телефон и дата рождения."
  ].join("\n");

  redirect(`https://wa.me/${digits}?text=${encodeURIComponent(message)}`);
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
  if (!BOOKING_STATUSES.has(status)) redirect(redirectTo);

  const booking = await prisma.booking.findUnique({ where: { id }, select: { id: true, startAt: true, endAt: true } });
  if (!booking) redirect(redirectTo);

  if (isActiveBookingStatus(status)) {
    if (booking.startAt <= new Date()) redirect(redirectTo);
    const conflictReasons = await getBookingConflictReasons({ startAt: booking.startAt, endAt: booking.endAt, ignoreBookingId: id });
    if (conflictReasons.length) redirect(redirectTo);
  }

  await prisma.booking.update({
    where: { id },
    data: {
      status: status as any,
      confirmedAt: status === "CONFIRMED" ? new Date() : undefined,
      cancelledAt: status === "CANCELLED_BY_ADMIN" || status === "REJECTED" ? new Date() : undefined
    }
  });

  if (status === "CANCELLED_BY_ADMIN") {
    await restoreOnlineWindowAfterAdminCancel(booking);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/bookings");
  revalidatePath("/admin/schedule");
  revalidatePath("/my");

  redirect(redirectTo);
}

export async function rememberMasterBooking(formData: FormData) {
  guard();
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
  guard();
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
