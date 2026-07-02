"use server";

import { addBookingMark, canRememberBooking, CLIENT_REMEMBER_MARK } from "@/lib/bookingRemember";
import { getOnlineBookingMinStart } from "@/lib/onlineBookingCutoff";
import { prisma } from "@/lib/prisma";
import { formatPhone } from "@/lib/format";
import { syncPublicRegistration } from "@/lib/clientSync";
import { setClientCookie } from "@/lib/clientSession";
import { redirect } from "next/navigation";

function required(value: FormDataEntryValue | null, name: string) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`Поле ${name} обязательно`);
  return text;
}

function optional(value: FormDataEntryValue | null) {
  return String(value || "").trim();
}

function birthDateFrom(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function myUrl(token: string, params: Record<string, string | undefined> = {}) {
  const search = new URLSearchParams({ client: token });
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  return `/my?${search.toString()}`;
}

function enterClientCabinet(token: string, params: Record<string, string | undefined> = {}) {
  setClientCookie(token);
  redirect(myUrl(token, params));
}

export async function registerClient(formData: FormData) {
  const firstName = required(formData.get("firstName"), "Имя");
  const lastName = required(formData.get("lastName"), "Фамилия");
  const phone = formatPhone(required(formData.get("phone"), "Телефон"));
  const birthDate = new Date(required(formData.get("birthDate"), "Дата рождения"));
  const notes = String(formData.get("comment") || "").trim();

  const existing = await prisma.client.findUnique({ where: { phone } });

  if (existing?.status === "PENDING") redirect(`/pending?phone=${encodeURIComponent(existing.phone)}&already=1`);
  if (existing?.status === "APPROVED") enterClientCabinet(existing.publicToken, { known: "1" });
  if (existing?.status === "BANNED") redirect("/unavailable");

  const result = await syncPublicRegistration({ firstName, lastName, phone, birthDate, notes });
  const client = result.client;

  if (client.status === "APPROVED") enterClientCabinet(client.publicToken, { known: "1" });
  if (client.status === "BANNED") redirect("/unavailable");

  redirect(`/pending?phone=${encodeURIComponent(client.phone)}`);
}

export async function loginClient(formData: FormData) {
  const phone = formatPhone(required(formData.get("phone"), "Телефон"));
  const birthDate = new Date(required(formData.get("birthDate"), "Дата рождения"));

  const client = await prisma.client.findUnique({ where: { phone } });
  if (!client) redirect(`/register?phone=${encodeURIComponent(phone)}`);

  const sameDate = client.birthDate.toISOString().slice(0, 10) === birthDate.toISOString().slice(0, 10);
  if (!sameDate) redirect(`/login?error=wrong_birthdate`);

  if (client.status === "APPROVED") enterClientCabinet(client.publicToken, { login: "1" });
  if (client.status === "BANNED") redirect(`/unavailable`);
  if (client.status === "REJECTED") redirect(`/register?phone=${encodeURIComponent(phone)}&rejected=1`);
  redirect(`/pending?phone=${encodeURIComponent(phone)}&already=1`);
}

export async function updateClientProfile(formData: FormData) {
  const clientToken = required(formData.get("clientToken"), "Клиент");
  const firstName = required(formData.get("firstName"), "Имя");
  const lastName = required(formData.get("lastName"), "Фамилия");
  const phone = formatPhone(required(formData.get("phone"), "Телефон"));
  const birthDate = birthDateFrom(required(formData.get("birthDate"), "Дата рождения"));
  const avatarUrl = optional(formData.get("avatarUrl"));

  const client = await prisma.client.findUnique({ where: { publicToken: clientToken } });
  if (!client) redirect("/login");

  const duplicate = await prisma.client.findUnique({ where: { phone } });
  if (duplicate && duplicate.id !== client.id) redirect(`/profile?client=${clientToken}&error=phone-exists`);

  await prisma.client.update({ where: { id: client.id }, data: { firstName, lastName, phone, birthDate, avatarUrl } });
  setClientCookie(clientToken);

  redirect(`/profile?client=${clientToken}&saved=1`);
}

export async function createBooking(formData: FormData) {
  const token = required(formData.get("clientToken"), "Клиент");
  const serviceId = required(formData.get("serviceId"), "Услуга");
  const startAt = new Date(required(formData.get("startAt"), "Время"));
  const clientComment = String(formData.get("comment") || "").trim();
  const returnDate = optional(formData.get("returnDate")) || startAt.toISOString().slice(0, 10);
  const returnTime = optional(formData.get("returnTime")) || startAt.toISOString();

  const client = await prisma.client.findUnique({ where: { publicToken: token } });
  if (!client || client.status !== "APPROVED") redirect("/unavailable");

  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!service || !service.isActive || !service.showInBooking) redirect(myUrl(token, { date: returnDate, time: returnTime, bookingError: "service" }));

  const settings = await prisma.setting.findMany();
  const minVisibleStart = getOnlineBookingMinStart(settings);
  if (startAt < minVisibleStart) redirect(myUrl(token, { date: returnDate, time: returnTime, busy: "1" }));

  const onlineWindow = await prisma.onlineWindow.findUnique({ where: { startAt } });
  if (!onlineWindow) redirect(myUrl(token, { date: returnDate, time: returnTime, busy: "1" }));

  const endAt = new Date(startAt.getTime() + service.durationMinutes * 60_000);

  const conflict = await prisma.booking.findFirst({
    where: {
      status: { in: ["PENDING", "CONFIRMED"] },
      startAt: { lt: endAt },
      endAt: { gt: startAt }
    }
  });

  const blocked = await prisma.blockedSlot.findFirst({
    where: { startAt: { lt: endAt }, endAt: { gt: startAt } }
  });

  if (conflict || blocked) redirect(myUrl(token, { date: returnDate, time: returnTime, busy: "1" }));

  const booking = await prisma.booking.create({
    data: {
      clientId: client.id,
      serviceId: service.id,
      startAt,
      endAt,
      clientComment,
      finalPrice: service.price,
      status: "PENDING"
    }
  });

  setClientCookie(token);
  redirect(myUrl(token, { created: booking.id }));
}

export async function rememberClientBooking(formData: FormData) {
  const token = required(formData.get("clientToken"), "Клиент");
  const bookingId = required(formData.get("bookingId"), "Запись");

  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, client: { is: { publicToken: token } }, status: { in: ["PENDING", "CONFIRMED"] } },
    select: { id: true, startAt: true, clientComment: true }
  });

  if (!booking) redirect(myUrl(token));
  if (!canRememberBooking(booking.startAt)) redirect(myUrl(token, { rememberError: "early" }) + "#upcoming-booking");

  await prisma.booking.update({
    where: { id: booking.id },
    data: { clientComment: addBookingMark(booking.clientComment, CLIENT_REMEMBER_MARK) }
  });

  setClientCookie(token);
  redirect(myUrl(token, { remembered: "1" }) + "#upcoming-booking");
}

export async function joinWaitlist(formData: FormData) {
  const token = required(formData.get("clientToken"), "Клиент");
  const mode = String(formData.get("waitMode") || "NEAREST");
  const note = String(formData.get("note") || "").trim();
  const desiredDates = formData.getAll("desiredDates").map((value) => String(value)).filter(Boolean);

  const client = await prisma.client.findUnique({ where: { publicToken: token } });
  if (!client || client.status !== "APPROVED") redirect("/unavailable");

  const waitMode = mode === "DATES" ? "DATES" : "NEAREST";

  const existing = await prisma.waitlistEntry.findFirst({
    where: { clientId: client.id, status: "ACTIVE" },
    orderBy: { createdAt: "desc" }
  });

  const data = {
    mode: waitMode,
    desiredDates: waitMode === "DATES" ? JSON.stringify(desiredDates) : "[]",
    note,
    status: "ACTIVE"
  };

  if (existing) {
    await prisma.waitlistEntry.update({ where: { id: existing.id }, data });
  } else {
    await prisma.waitlistEntry.create({ data: { clientId: client.id, ...data } });
  }

  setClientCookie(token);
  redirect(`/my?client=${token}&waitlist=${waitMode === "DATES" ? "dates" : "nearest"}#waitlist`);
}

export async function cancelWaitlistEntry(formData: FormData) {
  const token = required(formData.get("clientToken"), "Клиент");
  const waitlistId = required(formData.get("waitlistId"), "Лист ожидания");

  const client = await prisma.client.findUnique({ where: { publicToken: token } });
  if (!client) redirect("/login");

  await prisma.waitlistEntry.updateMany({
    where: { id: waitlistId, clientId: client.id, status: "ACTIVE" },
    data: { status: "CANCELLED_BY_CLIENT", closedAt: new Date() }
  });

  setClientCookie(token);
  redirect(`/my?client=${token}&waitlist=cancelled#waitlist`);
}

export async function cancelClientBooking(formData: FormData) {
  const token = required(formData.get("clientToken"), "Клиент");
  const bookingId = required(formData.get("bookingId"), "Запись");
  const afterCancel = optional(formData.get("afterCancel"));

  const client = await prisma.client.findUnique({ where: { publicToken: token } });
  if (!client) redirect("/login");

  await prisma.booking.updateMany({
    where: { id: bookingId, clientId: client.id, status: { in: ["PENDING", "CONFIRMED"] } },
    data: { status: "CANCELLED_BY_CLIENT", cancelledAt: new Date() }
  });

  setClientCookie(token);
  if (afterCancel === "reschedule") redirect(`/my?client=${token}&cancelled=1&reschedule=1#windows`);
  redirect(`/my?client=${token}&cancelled=1`);
}
