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

function safeJsonList(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export async function saveScheduleMode(formData: FormData) {
  guard();
  const stepMinutes = n(formData, "stepMinutes", 30);
  const startTime = s(formData, "defaultStartTime") || "09:00";
  const endTime = s(formData, "defaultEndTime") || "20:00";

  await prisma.setting.upsert({
    where: { key: "SLOT_STEP_MINUTES" },
    create: { key: "SLOT_STEP_MINUTES", value: String(stepMinutes) },
    update: { value: String(stepMinutes) }
  });

  await prisma.setting.upsert({
    where: { key: "slot_step_minutes" },
    create: { key: "slot_step_minutes", value: String(stepMinutes) },
    update: { value: String(stepMinutes) }
  });

  for (let weekday = 0; weekday < 7; weekday += 1) {
    await prisma.scheduleRule.upsert({
      where: { weekday },
      create: { weekday, isWorkingDay: true, startTime, endTime },
      update: { isWorkingDay: true, startTime, endTime }
    });
  }

  redirect("/admin/schedule?view=mode&done=Режим сохранён");
}

export async function saveBulkDayOverrides(formData: FormData) {
  guard();

  const dates = safeJsonList(s(formData, "datesJson"));
  const kind = s(formData, "kind") || "DAY_OFF";
  const month = s(formData, "month");
  const startTime = s(formData, "startTime") || null;
  const endTime = s(formData, "endTime") || null;

  for (const key of dates) {
    const date = dateFromKey(key);
    await prisma.dayOverride.upsert({
      where: { date },
      create: {
        date,
        kind: kind as any,
        startTime,
        endTime,
        note: kind === "DAY_OFF" ? "Отмечено как выходной" : kind === "SPECIAL" ? "Особенный день" : ""
      },
      update: {
        kind: kind as any,
        startTime,
        endTime,
        note: kind === "DAY_OFF" ? "Отмечено как выходной" : kind === "SPECIAL" ? "Особенный день" : ""
      }
    });
  }

  redirect(`/admin/schedule?view=calendar&month=${month}&done=Даты сохранены#calendar`);
}

export async function saveOnlineWindows(formData: FormData) {
  guard();

  const dateKey = s(formData, "date");
  const month = s(formData, "month");
  const times = safeJsonList(s(formData, "timesJson"));
  const day = dateFromKey(dateKey);

  const dayStart = combineDateAndTime(day, "00:00");
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  await prisma.onlineWindow.deleteMany({
    where: { startAt: { gte: dayStart, lt: dayEnd } }
  });

  for (const time of times) {
    await prisma.onlineWindow.upsert({
      where: { startAt: combineDateAndTime(day, time) },
      create: { startAt: combineDateAndTime(day, time), note: "Открыто для онлайн-записи" },
      update: { note: "Открыто для онлайн-записи" }
    });
  }

  redirect(`/admin/schedule?view=calendar&month=${month}&date=${dateKey}&success=Онлайн-окна сохранены#selected-day`);
}

export async function deleteOnlineWindow(formData: FormData) {
  guard();
  const id = s(formData, "id");
  await prisma.onlineWindow.delete({ where: { id } });
  redirect("/admin/schedule/free?done=Окно удалено");
}

export async function saveDayOverride(formData: FormData) {
  guard();
  const dateKey = s(formData, "date");
  const date = dateFromKey(dateKey);
  const kind = s(formData, "kind") || "WORKING";
  const startTime = s(formData, "startTime") || null;
  const endTime = s(formData, "endTime") || null;
  const note = s(formData, "note");

  await prisma.dayOverride.upsert({
    where: { date },
    create: { date, kind: kind as any, startTime, endTime, note },
    update: { kind: kind as any, startTime, endTime, note }
  });

  redirect(`/admin/schedule?view=calendar&date=${dateKey}&month=${s(formData, "month")}&success=День сохранён#selected-day`);
}

export async function deleteDayOverride(formData: FormData) {
  guard();
  const id = s(formData, "id");
  const month = s(formData, "month");
  await prisma.dayOverride.delete({ where: { id } });
  redirect(`/admin/schedule?view=calendar&month=${month}&done=Пометка дня сброшена#calendar`);
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
    prisma.booking.findMany({ where: { status: { in: ["PENDING", "CONFIRMED"] as any } }, include: { client: true } }),
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
  if (overlapBooking) reasons.push(`наложение с записью клиента ${overlapBooking.client.lastName} ${overlapBooking.client.firstName}`);

  const overlapBlock = blockedSlots.find((slot) => overlaps(startAt, endAt, slot.startAt, slot.endAt));
  if (overlapBlock) reasons.push("запись попадает на закрытое окно");

  if (reasons.length > 0 && !force) {
    redirect(`/admin/schedule?view=calendar&month=${month}&date=${dateKey}&warning=${encodeURIComponent(reasons.join("; "))}#manual-booking`);
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

  redirect(`/admin/schedule?view=calendar&month=${month}&date=${dateKey}&success=Запись создана#selected-day`);
}
