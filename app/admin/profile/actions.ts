"use server";

import { isAdmin, setAdminCookie } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { changeAdminPassword } from "@/lib/adminPassword";
import { normalizeAvatarDataUrl } from "@/lib/avatarUpload";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

const clean = (form: FormData, key: string) => String(form.get(key) || "").trim();
export async function saveMasterProfile(form: FormData) {
  if (!(await isAdmin())) redirect("/admin/login");
  const password = String(form.get("newAdminPassword") || "");
  const repeat = String(form.get("repeatAdminPassword") || "");
  if (password || repeat) {
    if (password.length < 8 || password.length > 1024) redirect("/admin/profile?error=short-password");
    if (password !== repeat) redirect("/admin/profile?error=password-mismatch");
  }
  const settings = [{ key: "master_name", value: clean(form, "masterName") || "Мастер" }, { key: "master_phone", value: clean(form, "masterPhone") }, { key: "master_location", value: clean(form, "masterLocation") }];
  const avatar = normalizeAvatarDataUrl(form.get("masterAvatarDataUrl"));
  if (avatar && !avatar.ok) redirect("/admin/profile?error=avatar");
  if (form.get("removeAvatar") === "on") settings.push({ key: "master_photo_url", value: "" });
  else if (avatar?.ok) settings.push({ key: "master_photo_url", value: avatar.value });
  if (password) { await changeAdminPassword(password, settings); await setAdminCookie(); }
  else await prisma.$transaction(settings.map(({ key, value }) => prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } })));
  revalidatePath("/"); revalidatePath("/pending"); revalidatePath("/admin");
  redirect("/admin/profile?saved=1");
}
