"use server";

import { isAdmin } from "@/lib/admin";
import { changeBookingStatus, saveAdminBooking, BookingError } from "@/lib/bookings";
import { businessDateTimeFromKeyAndTime } from "@/lib/timezone";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const text = (form: FormData, key: string) => String(form.get(key) || "").trim();
const back = (form: FormData, params: Record<string, string>) => `/admin/schedule?${new URLSearchParams({ view: "calendar", month: text(form, "month"), date: text(form, "date"), ...params })}#selected-day`;
async function mutate(form: FormData, status?: string) {
  if (!(await isAdmin())) redirect("/admin/login");
  try {
    if (status) await changeBookingStatus(text(form, "id"), status);
    else await saveAdminBooking({ id: text(form, "id"), clientId: text(form, "clientId"), serviceId: text(form, "serviceId"), startAt: businessDateTimeFromKeyAndTime(text(form, "date"), text(form, "startTime")), durationMinutes: Number(text(form, "durationMinutes")), status: text(form, "status"), finalPrice: text(form, "finalPrice") ? Number(text(form, "finalPrice")) : null, adminComment: text(form, "adminComment") });
  } catch (error) { if (error instanceof BookingError) redirect(back(form, { warning: error.message })); throw error; }
  for (const path of ["/admin", "/admin/schedule", "/admin/bookings", "/my"]) revalidatePath(path);
  redirect(back(form, { success: "Запись сохранена" }));
}
export async function confirmScheduleBooking(form: FormData) { await mutate(form, "CONFIRMED"); }
export async function cancelScheduleBooking(form: FormData) { await mutate(form, "CANCELLED_BY_ADMIN"); }
export async function updateScheduleBooking(form: FormData) { await mutate(form); }
