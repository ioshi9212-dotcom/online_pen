"use server";

import { clearAdminCookie, isAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { changeAdminPassword } from "@/lib/adminPassword";
import { redirect } from "next/navigation";

function guard() {
  if (!isAdmin()) redirect("/admin/login");
}

function clean(value: FormDataEntryValue | null) {
  return String(value || "").trim();
}

async function saveSetting(key: string, value: string) {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value }
  });
}

export async function saveMasterProfile(formData: FormData) {
  guard();

  await saveSetting("master_name", clean(formData.get("masterName")) || "Мастер");
  await saveSetting("master_phone", clean(formData.get("masterPhone")));
  await saveSetting("master_photo_url", clean(formData.get("masterPhotoUrl")));

  const password = clean(formData.get("newAdminPassword"));
  const repeatPassword = clean(formData.get("repeatAdminPassword"));

  if (password || repeatPassword) {
    if (password.length < 12) redirect("/admin/profile?error=short-password");
    if (password !== repeatPassword) redirect("/admin/profile?error=password-mismatch");
    await changeAdminPassword(password);
    clearAdminCookie();
    redirect("/admin/login?passwordChanged=1");
  }

  redirect("/admin/profile?saved=1");
}
