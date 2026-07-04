"use server";

import { isAdmin } from "@/lib/admin";
import { getBookingConflictReasons } from "@/lib/bookingConflicts";
import { ONLINE_BOOKING_HIDE_DAYS_KEY, normalizeOnlineBookingHideDays } from "@/lib/onlineBookingCutoff";
import { combineDateAndTime, dateFromKey, getEffectiveDay, overlaps, parseMinutes } from "@/lib/schedule";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
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

function dayRange(key: string) {
  const day = dateFromKey(key);
  const start = combineDateAndTime(day, "00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { day, start, end };
}

function bulkKindLabel(kind: string) {
  if (kind === "DAY_OFF") return "выходные";
  if (kind === "SPECIAL") return "особенные дни";
  return "рабочие дни";
}

function scheduleModeRedirect(message: string) {
  const params = new URLSearchParams({ view: "mode", done: message });
  redirect(`/admin/schedule?${params.toString()}`);
}

async function persistBulkDayOverrides(formData: FormData) {
  guard();

  const dates = safeJsonList(s(formData, "datesJson"));
  const rawKind = s(formData, "kind") || "DAY_OFF";
  const kind = ["DAY_OFF", "WORKING", "SPECIAL"].includes(rawKind) ? rawKind : "DAY_OFF";
  const month = s(formData, "month");
  const startTime = s(formData, "startTime") || null;
  const endTime = s(formData, "endTime") || null;

  for (const key of dates) {
    const { day, start, end } = dayRange(key);
    await prisma.dayOverride.upsert({
      where: { date: day },
      create: {
        date: day,
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

    if (kind === "DAY_OFF") {
      await prisma.onlineWindow.deleteMany({ where: { startAt: { gte: start, lt: end } } });
    }
  }

  return { saved: dates.length, kind, month };
}

export async function saveScheduleMode(formData: FormData) {
  guard();
  const stepMinutes = n(formData, "stepMinutes", 30);
  const startTime = s(formData, "defaultStartTime") || "09:00";
  const endTime = s(formData, "defaultEndTime") || "20:00";
  const onlineHideDays = normalizeOnlineBookingHideDays(formData.get("onlineHideDays"));

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

  await prisma.setting.upsert({
    where: { key: ONLINE_BOOKING_HIDE_DAYS_KEY },
    create: { key: ONLINE_BOOKING_HIDE_DAYS_KEY, value: String(onlineHideDays) },
    update: { value: String(onlineHideDays) }
  });

  for (let weekday = 0; weekday < 7; weekday += 1) {
    await prisma.scheduleRule.upsert({
      where: { weekday },
      create: { weekday, isWorkingDay: true, startTime, endTime },
      update: { isWorkingDay: true, startTime, endTime }
    });
  }

  revalidatePath("/admin/schedule");
  revalidatePath("/admin/settings");
  revalidatePath("/my");
  scheduleModeRedirect("Режим сохранён");
}

export async function saveBulkDayOverrides(formData: FormData) {
  const result = await persistBulkDayOverrides(formData);
  redirect(`/admin/schedule?view=calendar&month=${result.month}&done=Даты сохранены#calendar`);
}

export async function saveBulkDayOverridesInline(formData: FormData) {
  const result = await persistBulkDayOverrides(formData);
  const label = bulkKindLabel(result.kind);
  return {
    ok: true,
    saved: result.saved,
    kind: result.kind,
    message: result.saved === 1 ? "Сохранено: 1 день" : `Сохранено: ${result.saved} дней (${label})`
  };
}

export async function saveOnlineWindows(formData: FormData) {
  guard();

  const dateKey = s(formData, "date");
  const month = s(formData, "month");
  const times = safeJsonList(s(formData, "timesJson"));
  const { day, start, end } = dayRange(dateKey);

  await prisma.onlineWindow.deleteMany({ where: { startAt: { gte: start, lt: end } } });

  for (const time of times) {
    const startAt = combineDateAndTime(day, time);
    const conflict = await prisma.booking.findFirst({
      where: {
        status: { in: ["PENDING", "CONFIRMED"] as any },
        startAt: { lte: startAt },
        endAt: { gt: startAt }
      }
    });
    const block = await prisma.blockedSlot.findFirst({ where: { startAt: { lte: startAt }, endAt: { gt: startAt } } });

    if (!conflict && !block) {
      await prisma.onlineWindow.upsert({
        where: { startAt },
        create: { startAt, note: "Открыто для онлайн-записи" },
        update: { note: "Открыто для онлайн-записи" }
      });
    }
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
  const { day, start, end } = dayRange(dateKey);
  const kind = s(formData, "kind") || "WORKING";
  const startTime = s(formData, "startTime") || null;
  const endTime = s(formData, "endTime") || null;
  const note = s(formData, "note");

  await prisma.dayOverride.upsert({
    where: { date: day },
    create: { date: day, kind: kind as any, startTime, endTime, note },
    update: { kind: kind as any, startTime, endTime, note }
  });

  if (kind === "DAY_OFF") {
    await prisma.onlineWindow.deleteMany({ where: { startAt: { gte: start, lt: end } } });
  }

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

  const sharedReasons = await getBookingConflictReasons({ startAt, endAt });
  for (const reason of sharedReasons) if (!reasons.includes(reason)) reasons.push(reason);

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
