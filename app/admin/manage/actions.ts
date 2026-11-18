"use server";

import { validDateKey, validTime } from "@/lib/validation";

import { isAdmin } from "@/lib/admin";
import { saveAdminBooking, BookingError } from "@/lib/bookings";
import { upsertManualClient } from "@/lib/clientSync";
import { safeDuration } from "@/lib/durations";
import { normalizePhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { businessDateTimeFromKeyAndTime } from "@/lib/timezone";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

async function guard() {
  if (!(await isAdmin())) redirect("/admin/login");
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
  await guard();
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

export async function createManualBooking(_state: { error: string }, formData: FormData) {
  await guard();
  const clientId = s(formData, "clientId");
  const serviceId = s(formData, "serviceId");
  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!service) return { error: "Услуга не найдена. Выберите другую." };
  const [day, time] = s(formData, "startAt").split("T");
  if (!validDateKey(day || "") || !validTime(time || "")) return { error: "Проверьте дату и время" };
  const startAt = dateTime(formData, "startAt");
  const durationMinutes = safeDuration(formData.get("durationMinutes"), service.durationMinutes || 150);
  const status = s(formData, "status") || "CONFIRMED";

  try {
    await saveAdminBooking({ clientId, serviceId, startAt, durationMinutes, status,
      clientComment: s(formData, "clientComment"), adminComment: s(formData, "adminComment"), finalPrice: nullablePrice(formData) });
  } catch (error) {
    if (error instanceof BookingError) return { error: error.message };
    throw error;
  }

  revalidatePath("/my");
  revalidatePath("/admin");
  revalidatePath("/admin/manage");
  revalidatePath("/admin/schedule");

  redirect(manageUrl({ booking: "created", clientId }));
}
