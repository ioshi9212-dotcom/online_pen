"use server";

import { normalizeAvatarDataUrl } from "@/lib/avatarUpload";
import { addBookingMark, canRememberBooking, CLIENT_REMEMBER_MARK } from "@/lib/bookingRemember";
import { getClientCookie, setClientCookie } from "@/lib/clientSession";
import { syncPublicRegistration } from "@/lib/clientSync";
import { formatPhone } from "@/lib/format";
import { getOnlineBookingMinStart } from "@/lib/onlineBookingCutoff";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rateLimit";
import { combineDateAndTime, getEffectiveDay } from "@/lib/schedule";
import { Prisma } from "@prisma/client";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

const BUNDLE_PREFIX = "bundle:";
const BUNDLE_COMMENT_PREFIX = "Услуги: ";

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

function myUrl(params: Record<string, string | undefined> = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const query = search.toString();
  return query ? `/my?${query}` : "/my";
}

function enterClientCabinet(token: string, params: Record<string, string | undefined> = {}) {
  setClientCookie(token);
  redirect(myUrl(params));
}

function currentClientToken() {
  const token = getClientCookie();
  if (!token) redirect("/login");
  return token;
}

async function currentClient() {
  const token = currentClientToken();
  const client = await prisma.client.findUnique({ where: { publicToken: token } });
  if (!client) redirect("/login");
  if (client.status !== "APPROVED") redirect("/unavailable");
  return client;
}

function requestIp() {
  const requestHeaders = headers();
  return requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim()
    || requestHeaders.get("x-real-ip")
    || "unknown";
}

function allowAttempt(scope: string, identity: string, limit: number) {
  return checkRateLimit(`${scope}:${requestIp()}:${identity}`, {
    limit,
    windowMs: 15 * 60_000,
    blockMs: 15 * 60_000
  }).ok;
}

function serviceIdsFromValue(value: string) {
  const rawIds = value.startsWith(BUNDLE_PREFIX)
    ? value.slice(BUNDLE_PREFIX.length).split(",")
    : [value];
  return Array.from(new Set(rawIds.map((id) => id.trim()).filter(Boolean))).slice(0, 2);
}

function bundleComment(title: string, comment: string, bundled: boolean) {
  if (!bundled) return comment;
  return `${BUNDLE_COMMENT_PREFIX}${title}${comment ? `\n${comment}` : ""}`;
}

export async function registerClient(formData: FormData) {
  const firstName = required(formData.get("firstName"), "Имя");
  const lastName = required(formData.get("lastName"), "Фамилия");
  const phone = formatPhone(required(formData.get("phone"), "Телефон"));
  const birthDate = birthDateFrom(required(formData.get("birthDate"), "Дата рождения"));
  const notes = String(formData.get("comment") || "").trim();

  if (!allowAttempt("client-register", phone, 5)) {
    redirect("/register?error=too-many-attempts");
  }

  const existing = await prisma.client.findUnique({ where: { phone } });

  if (existing?.status === "PENDING") redirect(`/pending?phone=${encodeURIComponent(existing.phone)}&already=1`);
  if (existing?.status === "APPROVED") redirect(`/login?known=1&phone=${encodeURIComponent(phone)}`);
  if (existing?.status === "BANNED") redirect("/unavailable");

  const result = await syncPublicRegistration({ firstName, lastName, phone, birthDate, notes });
  const client = result.client;

  if (client.status === "APPROVED") redirect(`/login?known=1&phone=${encodeURIComponent(phone)}`);
  if (client.status === "BANNED") redirect("/unavailable");

  redirect(`/pending?phone=${encodeURIComponent(client.phone)}`);
}

export async function loginClient(formData: FormData) {
  const phone = formatPhone(required(formData.get("phone"), "Телефон"));
  const birthDate = birthDateFrom(required(formData.get("birthDate"), "Дата рождения"));

  if (!allowAttempt("client-login", phone, 8)) {
    redirect(`/login?error=too-many-attempts&phone=${encodeURIComponent(phone)}`);
  }

  const client = await prisma.client.findUnique({ where: { phone } });
  if (!client) redirect(`/register?phone=${encodeURIComponent(phone)}`);

  const sameDate = client.birthDate.toISOString().slice(0, 10) === birthDate.toISOString().slice(0, 10);
  if (!sameDate) redirect(`/login?error=wrong-birthdate&phone=${encodeURIComponent(phone)}`);

  if (client.status === "APPROVED") enterClientCabinet(client.publicToken, { login: "1" });
  if (client.status === "BANNED") redirect("/unavailable");
  if (client.status === "REJECTED") redirect(`/register?phone=${encodeURIComponent(phone)}&rejected=1`);
  redirect(`/pending?phone=${encodeURIComponent(phone)}&already=1`);
}

export async function updateClientProfile(formData: FormData) {
  const client = await currentClient();
  const firstName = required(formData.get("firstName"), "Имя");
  const lastName = required(formData.get("lastName"), "Фамилия");
  const phone = formatPhone(required(formData.get("phone"), "Телефон"));
  const birthDate = birthDateFrom(required(formData.get("birthDate"), "Дата рождения"));

  const duplicate = await prisma.client.findUnique({ where: { phone } });
  if (duplicate && duplicate.id !== client.id) redirect("/profile?error=phone-exists");

  let avatarUrl = client.avatarUrl;
  const removeAvatar = formData.get("removeAvatar") === "on";
  const avatarDataUrl = normalizeAvatarDataUrl(formData.get("avatarDataUrl"));

  if (removeAvatar) {
    avatarUrl = "";
  } else if (avatarDataUrl) {
    if (!avatarDataUrl.ok) redirect(`/profile?error=avatar-${avatarDataUrl.error}`);
    avatarUrl = avatarDataUrl.value;
  }

  await prisma.client.update({
    where: { id: client.id },
    data: { firstName, lastName, phone, birthDate, avatarUrl }
  });

  redirect(myUrl({ profileSaved: "1" }) + "#profile");
}

export async function createBooking(formData: FormData) {
  const client = await currentClient();
  const serviceValue = required(formData.get("serviceId"), "Услуга");
  const startAt = new Date(required(formData.get("startAt"), "Время"));
  if (Number.isNaN(startAt.getTime())) redirect(myUrl({ bookingError: "time" }));
  const clientComment = String(formData.get("comment") || "").trim();
  const returnDate = optional(formData.get("returnDate")) || startAt.toISOString().slice(0, 10);
  const returnTime = optional(formData.get("returnTime")) || startAt.toISOString();
  const serviceIds = serviceIdsFromValue(serviceValue);

  const services = await prisma.service.findMany({
    where: { id: { in: serviceIds }, isActive: true, showInBooking: true }
  });
  const byId = new Map(services.map((service) => [service.id, service]));
  const orderedServices = serviceIds.map((id) => byId.get(id)).filter(Boolean) as typeof services;

  if (orderedServices.length !== serviceIds.length || orderedServices.length === 0) {
    redirect(myUrl({ date: returnDate, time: returnTime, bookingError: "service" }));
  }

  const [settings, scheduleRules, dayOverrides] = await Promise.all([
    prisma.setting.findMany(),
    prisma.scheduleRule.findMany(),
    prisma.dayOverride.findMany()
  ]);
  const minVisibleStart = getOnlineBookingMinStart(settings);
  if (startAt < minVisibleStart) {
    redirect(myUrl({ date: returnDate, time: returnTime, busy: "1" }));
  }

  const durationMinutes = orderedServices.reduce((sum, service) => sum + service.durationMinutes, 0);
  const finalPrice = orderedServices.reduce((sum, service) => sum + service.price, 0);
  const serviceTitle = orderedServices.map((service) => service.title).join(" + ");
  const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);
  const effectiveDay = getEffectiveDay(startAt, scheduleRules, dayOverrides);
  const dayEnd = combineDateAndTime(startAt, effectiveDay.endTime);
  if (endAt > dayEnd) {
    redirect(myUrl({ date: returnDate, time: returnTime, busy: "1" }));
  }

  try {
    const booking = await prisma.$transaction(async (tx) => {
      const [onlineWindow, conflict, blocked] = await Promise.all([
        tx.onlineWindow.findUnique({ where: { startAt } }),
        tx.booking.findFirst({
          where: {
            status: { in: ["PENDING", "CONFIRMED"] },
            startAt: { lt: endAt },
            endAt: { gt: startAt }
          }
        }),
        tx.blockedSlot.findFirst({
          where: { startAt: { lt: endAt }, endAt: { gt: startAt } }
        })
      ]);

      if (!onlineWindow || conflict || blocked) return null;

      return tx.booking.create({
        data: {
          clientId: client.id,
          serviceId: orderedServices[0].id,
          startAt,
          endAt,
          clientComment: bundleComment(serviceTitle, clientComment, orderedServices.length > 1),
          finalPrice,
          status: "PENDING"
        }
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (!booking) redirect(myUrl({ date: returnDate, time: returnTime, busy: "1" }));
    redirect(myUrl({ created: booking.id }));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      redirect(myUrl({ date: returnDate, time: returnTime, busy: "1" }));
    }
    throw error;
  }
}

export async function rememberClientBooking(formData: FormData) {
  const client = await currentClient();
  const bookingId = required(formData.get("bookingId"), "Запись");

  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, clientId: client.id, status: { in: ["PENDING", "CONFIRMED"] } },
    select: { id: true, startAt: true, clientComment: true }
  });

  if (!booking) redirect(myUrl());
  if (!canRememberBooking(booking.startAt)) {
    redirect(myUrl({ rememberError: "early" }) + "#upcoming-booking");
  }

  await prisma.booking.update({
    where: { id: booking.id },
    data: { clientComment: addBookingMark(booking.clientComment, CLIENT_REMEMBER_MARK) }
  });

  redirect(myUrl({ remembered: "1" }) + "#upcoming-booking");
}

export async function joinWaitlist(formData: FormData) {
  const client = await currentClient();
  const mode = String(formData.get("waitMode") || "NEAREST");
  const note = String(formData.get("note") || "").trim();
  const desiredDates = formData.getAll("desiredDates").map((value) => String(value)).filter(Boolean);
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

  redirect(myUrl({ waitlist: waitMode === "DATES" ? "dates" : "nearest" }) + "#waitlist");
}

export async function cancelWaitlistEntry(formData: FormData) {
  const client = await currentClient();
  const waitlistId = required(formData.get("waitlistId"), "Лист ожидания");

  await prisma.waitlistEntry.updateMany({
    where: { id: waitlistId, clientId: client.id, status: "ACTIVE" },
    data: { status: "CANCELLED_BY_CLIENT", closedAt: new Date() }
  });

  redirect(myUrl({ waitlist: "cancelled" }) + "#waitlist");
}

export async function cancelClientBooking(formData: FormData) {
  const client = await currentClient();
  const bookingId = required(formData.get("bookingId"), "Запись");
  const afterCancel = optional(formData.get("afterCancel"));

  await prisma.booking.updateMany({
    where: { id: bookingId, clientId: client.id, status: { in: ["PENDING", "CONFIRMED"] } },
    data: { status: "CANCELLED_BY_CLIENT", cancelledAt: new Date() }
  });

  if (afterCancel === "reschedule") {
    redirect(myUrl({ cancelled: "1", reschedule: "1" }) + "#booking-flow");
  }
  redirect(myUrl({ cancelled: "1" }));
}
