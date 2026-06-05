"use server";

import { prisma } from "@/lib/prisma";
import { formatPhone } from "@/lib/format";
import { redirect } from "next/navigation";

function required(value: FormDataEntryValue | null, name: string) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`Поле ${name} обязательно`);
  return text;
}

export async function registerClient(formData: FormData) {
  const firstName = required(formData.get("firstName"), "Имя");
  const lastName = required(formData.get("lastName"), "Фамилия");
  const phone = formatPhone(required(formData.get("phone"), "Телефон"));
  const birthDate = new Date(required(formData.get("birthDate"), "Дата рождения"));
  const notes = String(formData.get("comment") || "").trim();

  const existing = await prisma.client.findUnique({ where: { phone } });

  if (existing) {
    if (existing.status === "APPROVED") redirect(`/booking?client=${existing.publicToken}`);
    redirect(`/pending?phone=${encodeURIComponent(phone)}`);
  }

  await prisma.client.create({
    data: { firstName, lastName, phone, birthDate, notes, status: "PENDING" }
  });

  redirect(`/pending?phone=${encodeURIComponent(phone)}`);
}

export async function loginClient(formData: FormData) {
  const phone = formatPhone(required(formData.get("phone"), "Телефон"));
  const birthDate = new Date(required(formData.get("birthDate"), "Дата рождения"));

  const client = await prisma.client.findUnique({ where: { phone } });
  if (!client) redirect(`/register?phone=${encodeURIComponent(phone)}`);

  const sameDate = client.birthDate.toISOString().slice(0, 10) === birthDate.toISOString().slice(0, 10);
  if (!sameDate) redirect(`/login?error=wrong_birthdate`);

  if (client.status === "APPROVED") redirect(`/booking?client=${client.publicToken}`);
  if (client.status === "BANNED") redirect(`/unavailable`);
  redirect(`/pending?phone=${encodeURIComponent(phone)}`);
}

export async function createBooking(formData: FormData) {
  const token = required(formData.get("clientToken"), "Клиент");
  const serviceId = required(formData.get("serviceId"), "Услуга");
  const startAt = new Date(required(formData.get("startAt"), "Время"));
  const clientComment = String(formData.get("comment") || "").trim();

  const client = await prisma.client.findUnique({ where: { publicToken: token } });
  if (!client || client.status !== "APPROVED") redirect("/unavailable");

  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!service || !service.isActive) redirect(`/booking?client=${token}`);

  const endAt = new Date(startAt.getTime() + service.durationMinutes * 60_000);

  const conflict = await prisma.booking.findFirst({
    where: {
      status: { in: ["PENDING", "CONFIRMED"] },
      startAt: { lt: endAt },
      endAt: { gt: startAt }
    }
  });

  const blocked = await prisma.blockedSlot.findFirst({
    where: {
      startAt: { lt: endAt },
      endAt: { gt: startAt }
    }
  });

  if (conflict || blocked) {
    redirect(`/booking?client=${token}&service=${serviceId}&busy=1`);
  }

  const booking = await prisma.booking.create({
    data: {
      clientId: client.id,
      serviceId,
      startAt,
      endAt,
      clientComment,
      finalPrice: service.price,
      status: "PENDING"
    }
  });

  redirect(`/my?client=${token}&created=${booking.id}`);
}

export async function cancelClientBooking(formData: FormData) {
  const token = required(formData.get("clientToken"), "Клиент");
  const bookingId = required(formData.get("bookingId"), "Запись");

  const client = await prisma.client.findUnique({ where: { publicToken: token } });
  if (!client) redirect("/login");

  await prisma.booking.updateMany({
    where: { id: bookingId, clientId: client.id, status: { in: ["PENDING", "CONFIRMED"] } },
    data: { status: "CANCELLED_BY_CLIENT", cancelledAt: new Date() }
  });

  redirect(`/my?client=${token}`);
}
