"use server";

import { isAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
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

  const code = clean(formData.get("newAccessCode"));
  const repeat = clean(formData.get("repeatAccessCode"));

  if (code || repeat) {
    if (code.length < 4) redirect("/admin/profile?error=short-code");
    if (code !== repeat) redirect("/admin/profile?error=code-mismatch");
    await saveSetting("master_access_code", code);
  }

  redirect("/admin/profile?saved=1");
}
