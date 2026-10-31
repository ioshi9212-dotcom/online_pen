"use server";

import { isAdmin } from "@/lib/admin";
import { ONLINE_BOOKING_HIDE_DAYS_KEY, normalizeOnlineBookingHideDays } from "@/lib/onlineBookingCutoff";
import { businessDateFromKey, businessDateTimeFromKeyAndTime, addBusinessDays } from "@/lib/timezone";
import { scheduleTransaction } from "@/lib/scheduleTransaction";
import { replaceOnlineWindows, WindowError } from "@/lib/onlineWindows";
import { saveAdminBooking, BookingError } from "@/lib/bookings";
import { validDateKey, validTime } from "@/lib/validation";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const s = (form: FormData, key: string) => String(form.get(key) || "").trim();
async function guard() { if (!(await isAdmin())) redirect("/admin/login"); }
function list(value: string): unknown { try { return JSON.parse(value); } catch { return null; } }
function calendarUrl(form: FormData, params: Record<string, string> = {}) {
  return `/admin/schedule?${new URLSearchParams({ view: "calendar", month: s(form, "month"), date: s(form, "date"), ...params })}#selected-day`;
}
function refresh() { revalidatePath("/admin/schedule"); revalidatePath("/admin"); revalidatePath("/my"); }

async function persistBulkDayOverrides(form: FormData) {
  await guard();
  const rawDates = list(s(form, "datesJson"));
  const kind = s(form, "kind");
  const startTime = s(form, "startTime") || null;
  const endTime = s(form, "endTime") || null;
  if (!Array.isArray(rawDates) || rawDates.length > 366 || rawDates.some((key) => typeof key !== "string" || !validDateKey(key)) || !["DAY_OFF", "WORKING", "SPECIAL"].includes(kind)) throw new Error("Проверьте даты и режим дня");
  if ((startTime && !validTime(startTime)) || (endTime && !validTime(endTime)) || (startTime && endTime && startTime >= endTime)) throw new Error("Проверьте часы работы");
  const dates = [...new Set(rawDates as string[])];
  await scheduleTransaction(async (tx) => {
    for (const key of dates) {
      const date = businessDateFromKey(key);
      const data = { kind: kind as "DAY_OFF" | "WORKING" | "SPECIAL", startTime, endTime, note: s(form, "note") };
      await tx.dayOverride.upsert({ where: { date }, create: { date, ...data }, update: data });
      if (kind === "DAY_OFF") await tx.onlineWindow.deleteMany({ where: { startAt: { gte: date, lt: businessDateFromKey(addBusinessDays(key, 1)) } } });
    }
  });
  refresh();
  return { saved: dates.length, kind, month: s(form, "month") };
}

export async function saveScheduleMode(form: FormData) {
  await guard();
  const stepMinutes = Number(s(form, "stepMinutes"));
  const startTime = s(form, "defaultStartTime");
  const endTime = s(form, "defaultEndTime");
  if (![15, 30, 45, 60, 90, 150].includes(stepMinutes) || !validTime(startTime) || !validTime(endTime) || startTime >= endTime) redirect("/admin/schedule?view=mode&warning=Проверьте часы работы");
  const hideDays = normalizeOnlineBookingHideDays(form.get("onlineHideDays"));
  await scheduleTransaction(async (tx) => {
    for (const [key, value] of [["SLOT_STEP_MINUTES", String(stepMinutes)], ["slot_step_minutes", String(stepMinutes)], [ONLINE_BOOKING_HIDE_DAYS_KEY, String(hideDays)]]) {
      await tx.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
    }
    for (let weekday = 0; weekday < 7; weekday++) await tx.scheduleRule.upsert({ where: { weekday }, create: { weekday, isWorkingDay: true, startTime, endTime }, update: { startTime, endTime } });
  });
  refresh();
  redirect("/admin/schedule?view=mode&done=Режим сохранён");
}

export async function saveBulkDayOverrides(form: FormData) {
  const result = await persistBulkDayOverrides(form);
  redirect(`/admin/schedule?view=calendar&month=${result.month}&done=Даты сохранены#calendar`);
}

export async function saveBulkDayOverridesInline(form: FormData) {
  const result = await persistBulkDayOverrides(form);
  return { ok: true, ...result, message: `Сохранено дней: ${result.saved}` };
}

export async function saveOnlineWindows(form: FormData) {
  await guard();
  try { await replaceOnlineWindows(s(form, "date"), list(s(form, "timesJson"))); }
  catch (error) { if (error instanceof WindowError) redirect(calendarUrl(form, { warning: error.message })); throw error; }
  refresh();
  redirect(calendarUrl(form, { success: "Онлайн-окна сохранены" }));
}

export async function deleteOnlineWindow(form: FormData) {
  await guard();
  await scheduleTransaction((tx) => tx.onlineWindow.deleteMany({ where: { id: s(form, "id") } }));
  refresh();
  redirect("/admin/schedule/free?done=Окно удалено");
}

export async function saveDayOverride(form: FormData) {
  form.set("datesJson", JSON.stringify([s(form, "date")]));
  await persistBulkDayOverrides(form);
  redirect(calendarUrl(form, { success: "День сохранён" }));
}

export async function deleteDayOverride(form: FormData) {
  await guard();
  await scheduleTransaction((tx) => tx.dayOverride.deleteMany({ where: { id: s(form, "id") } }));
  refresh();
  redirect(calendarUrl(form, { done: "Пометка дня сброшена" }));
}

export async function createScheduleBooking(form: FormData) {
  await guard();
  try {
    await saveAdminBooking({ clientId: s(form, "clientId"), serviceId: s(form, "serviceId"), startAt: businessDateTimeFromKeyAndTime(s(form, "date"), s(form, "startTime")), durationMinutes: Number(s(form, "durationMinutes")), status: "CONFIRMED", finalPrice: s(form, "finalPrice") ? Number(s(form, "finalPrice")) : null, adminComment: s(form, "adminComment") });
  } catch (error) { if (error instanceof BookingError) redirect(calendarUrl(form, { warning: error.message })); throw error; }
  refresh();
  redirect(calendarUrl(form, { success: "Запись создана" }));
}
