"use server";

import { normalizeAvatarDataUrl } from "@/lib/avatarUpload";
import { addBookingMark, canRememberBooking, CLIENT_REMEMBER_MARK } from "@/lib/bookingRemember";
import { prisma } from "@/lib/prisma";
import { formatPhone } from "@/lib/format";
import { syncPublicRegistration } from "@/lib/clientSync";
import { requireClient, setClientCookie } from "@/lib/clientSession";
import { allowAuthAttempt } from "@/lib/authRateLimit";
import { parseBirthDate, validDateKey } from "@/lib/validation";
import { bookOnline, BookingError, cancelOnlineBooking } from "@/lib/bookings";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const text = (form: FormData, key: string) => String(form.get(key) || "").trim();

export async function registerClient(form: FormData) {
  const phone = formatPhone(text(form, "phone"));
  if (!(await allowAuthAttempt("client", phone))) redirect("/login?error=rate");
  let birthDate: Date;
  try { birthDate = parseBirthDate(text(form, "birthDate")); } catch { redirect("/register?error=input"); }
  if (!text(form, "firstName") || !text(form, "lastName") || phone.replace(/\D/g, "").length < 10) redirect("/register?error=input");
  const result = await syncPublicRegistration({ firstName: text(form, "firstName"), lastName: text(form, "lastName"), phone, birthDate, notes: text(form, "comment") });
  // Registration never authenticates or updates an existing client's birth date.
  if (result.mode === "existing") redirect("/login?known=1");
  redirect("/pending");
}

export async function loginClient(form: FormData) {
  const phone = formatPhone(text(form, "phone"));
  if (!(await allowAuthAttempt("client", phone))) redirect("/login?error=rate");
  let birthDate: Date;
  try { birthDate = parseBirthDate(text(form, "birthDate")); } catch { redirect("/login?error=credentials"); }
  const client = await prisma.client.findUnique({ where: { phone } });
  if (!client || client.birthDate.toISOString().slice(0, 10) !== birthDate.toISOString().slice(0, 10)) redirect("/login?error=credentials");
  if (client.status === "BANNED" || client.status === "REJECTED") redirect("/unavailable");
  if (client.status !== "APPROVED") redirect("/pending?already=1");
  await setClientCookie(client.publicToken);
  redirect("/my?login=1");
}

export async function updateClientProfile(form: FormData) {
  const client = await requireClient();
  const firstName = text(form, "firstName");
  const lastName = text(form, "lastName");
  const phone = formatPhone(text(form, "phone"));
  let birthDate: Date;
  try { birthDate = parseBirthDate(text(form, "birthDate")); } catch { redirect("/profile?error=input"); }
  if (!firstName || !lastName || phone.replace(/\D/g, "").length < 10) redirect("/profile?error=input");
  const duplicate = await prisma.client.findUnique({ where: { phone } });
  if (duplicate && duplicate.id !== client.id) redirect("/profile?error=phone-exists");
  let avatarUrl = client.avatarUrl;
  const avatar = normalizeAvatarDataUrl(form.get("avatarDataUrl"));
  if (form.get("removeAvatar") === "on") avatarUrl = "";
  else if (avatar) {
    if (!avatar.ok) redirect(`/profile?error=avatar-${avatar.error}`);
    avatarUrl = avatar.value;
  }
  await prisma.client.update({ where: { id: client.id }, data: { firstName, lastName, phone, birthDate, avatarUrl } });
  redirect("/my?profileSaved=1#profile");
}

export async function createBooking(_state: { error: string }, form: FormData) {
  const client = await requireClient();
  try {
    const booking = await bookOnline({ clientId: client.id, serviceId: text(form, "serviceId"), startAt: new Date(text(form, "startAt")), comment: text(form, "comment"), rescheduleId: text(form, "rescheduleId") || undefined });
    revalidatePath("/admin");
    revalidatePath("/admin/schedule");
    revalidatePath("/my");
    redirect(`/my?created=${booking.id}`);
  } catch (error) {
    if (error instanceof BookingError) return { error: error.message === "RESCHEDULE_UNAVAILABLE" ? "Прежняя запись уже изменилась. Обновите страницу: перенос не выполнен." : "Время уже занято или недоступно для этой услуги. Выберите другое окно. " + (text(form, "rescheduleId") ? " Прежняя запись сохранена." : "") };
    throw error;
  }
}

export async function rememberClientBooking(form: FormData) {
  const client = await requireClient();
  const booking = await prisma.booking.findFirst({ where: { id: text(form, "bookingId"), clientId: client.id, status: { in: ["PENDING", "CONFIRMED"] } } });
  if (!booking) redirect("/my");
  if (!canRememberBooking(booking.startAt)) redirect("/my?rememberError=early#upcoming-booking");
  await prisma.booking.update({ where: { id: booking.id }, data: { clientComment: addBookingMark(booking.clientComment, CLIENT_REMEMBER_MARK) } });
  redirect("/my?remembered=1#upcoming-booking");
}

export async function joinWaitlist(form: FormData) {
  const client = await requireClient();
  const mode = text(form, "waitMode") === "DATES" ? "DATES" : "NEAREST";
  const desiredDates = form.getAll("desiredDates").map(String).filter(validDateKey);
  if (mode === "DATES" && !desiredDates.length) redirect("/my?waitlistError=dates#waitlist");
  const data = { mode, desiredDates: mode === "DATES" ? JSON.stringify(desiredDates) : "[]", note: text(form, "note"), status: "ACTIVE" };
  const existing = await prisma.waitlistEntry.findFirst({ where: { clientId: client.id, status: "ACTIVE" }, orderBy: { createdAt: "desc" } });
  if (existing) await prisma.waitlistEntry.update({ where: { id: existing.id }, data });
  else await prisma.waitlistEntry.create({ data: { clientId: client.id, ...data } });
  redirect(`/my?waitlist=${mode === "DATES" ? "dates" : "nearest"}#waitlist`);
}

export async function cancelWaitlistEntry(form: FormData) {
  const client = await requireClient();
  await prisma.waitlistEntry.updateMany({ where: { id: text(form, "waitlistId"), clientId: client.id, status: "ACTIVE" }, data: { status: "CANCELLED_BY_CLIENT", closedAt: new Date() } });
  redirect("/my?waitlist=cancelled#waitlist");
}

export async function cancelClientBooking(form: FormData) {
  const client = await requireClient();
  await cancelOnlineBooking(client.id, text(form, "bookingId"));
  revalidatePath("/my");
  revalidatePath("/admin");
  revalidatePath("/admin/schedule");
  redirect("/my?cancelled=1");
}
