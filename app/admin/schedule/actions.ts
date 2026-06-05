"use server";

import { isAdmin } from "@/lib/admin";
import { combineDateAndTime, dateFromKey, getEffectiveDay, overlaps, parseMinutes } from "@/lib/schedule";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

function guard() {
  if (!isAdmin()) redirect("/admin/login");
}

function s(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function n(formData: FormData, key: string, fallback: number) {
  const parsed = Number(formData.get(key));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function dayDate(formData: FormData) {
  return dateFromKey(s(formData, "date"));
}

export async function saveScheduleMode(formData: FormData) {
  guard();
  const stepMinutes = n(formData, "stepMinutes", 30);

  await prisma.setting.upsert({
    where: { key: "SLOT_STEP_MINUTES" },
    create: { key: "SLOT_STEP_MINUTES", value: String(stepMinutes) },
    update: { value: String(stepMinutes) }
  });

  for (let weekday = 0; weekday < 7; weekday += 1) {
    const isWorkingDay = formData.get(`working-${weekday}`) === "on";
    const startTime = s(formData, `start-${weekday}`) || "09:00";
    const endTime = s(formData, `end-${weekday}`) || "20:00";

    await prisma.scheduleRule.upsert({
      where: { weekday },
      create: { weekday, isWorkingDay, startTime, endTime },
      update: { isWorkingDay, startTime, endTime }
    });
  }

  redirect("/admin/schedule#mode");
}

export async function saveDayOverride(formData: FormData) {
  guard();
  const date = dayDate(formData);
  const kind = s(formData, "kind") || "WORKING";
  const startTime = s(formData, "startTime") || null;
  const endTime = s(formData, "endTime") || null;
  const note = s(formData, "note");

  await prisma.dayOverride.upsert({
    where: { date },
    create: { date, kind: kind as any, startTime, endTime, note },
    update: { kind: kind as any, startTime, endTime, note }
  });

  redirect(`/admin/schedule?date=${s(formData, "date")}&month=${s(formData, "month")}#calendar`);
}

export async function deleteDayOverride(formData: FormData) {
  guard();
  const id = s(formData, "id");
  const month = s(formData, "month");
  await prisma.dayOverride.delete({ where: { id } });
  redirect(`/admin/schedule?month=${month}#calendar`);
}

export async function createScheduleBooking(formData: FormData) {
  guard();
  const dateKey = s(formData, "date");
  const month = s(formData, "month");
  const day = dateFromKey(dateKey);
  const startTime = s(formData, "startTime");
  const durationMinutes = n(formData, "durationMinutes", 150);
  const startAt = combineDateAndTime(day, startTime);
  const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);
  const force = formData.get("force") === "on";

  const [rules, overrides, bookings, blockedSlots] = await Promise.all([
    prisma.scheduleRule.findMany(),
    prisma.dayOverride.findMany({ where: { date: day } }),
    prisma.booking.findMany({ where: { status: { in: ["PENDING", "CONFIRMED"] as any } } }),
    prisma.blockedSlot.findMany()
  ]);

  const effective = getEffectiveDay(day, rules, overrides);
  const reasons: string[] = [];

  if (!effective.isWorkingDay) reasons.push("выбранный день отмечен как выходной");

  const workStart = parseMinutes(effective.startTime);
  const workEnd = parseMinutes(effective.endTime);
  const selectedStart = parseMinutes(startTime);
  const selectedEnd = selectedStart + durationMinutes;
  if (selectedStart < workStart || selectedEnd > workEnd) reasons.push("запись выходит за рабочие часы выбранного дня");

  const overlapBooking = bookings.find((booking) => overlaps(startAt, endAt, booking.startAt, booking.endAt));
  if (overlapBooking) reasons.push("запись пересекается с другой активной записью");

  const overlapBlock = blockedSlots.find((slot) => overlaps(startAt, endAt, slot.startAt, slot.endAt));
  if (overlapBlock) reasons.push("запись попадает на закрытое окно");

  if (reasons.length > 0 && !force) {
    redirect(`/admin/schedule?month=${month}&date=${dateKey}&warning=${encodeURIComponent(reasons.join("; "))}#book`);
  }

  const serviceId = s(formData, "serviceId");
  await prisma.booking.create({
    data: {
      clientId: s(formData, "clientId"),
      serviceId,
      startAt,
      endAt,
      status: "CONFIRMED",
      finalPrice: s(formData, "finalPrice") ? Number(s(formData, "finalPrice")) : null,
      adminComment: s(formData, "adminComment"),
      confirmedAt: new Date()
    }
  });

  redirect(`/admin/schedule?month=${month}&date=${dateKey}&success=Запись создана#book`);
}
