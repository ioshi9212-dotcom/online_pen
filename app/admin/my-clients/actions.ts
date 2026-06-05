"use server";

import { isAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

function guard() {
  if (!isAdmin()) redirect("/admin/login");
}

function s(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function cleanPhone(value: string) {
  return value.replace(/[^0-9+]/g, "").trim();
}

function birthDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

export async function saveMyClient(formData: FormData) {
  guard();
  const id = s(formData, "id");
  const status = s(formData, "status") || "APPROVED";

  await prisma.client.update({
    where: { id },
    data: {
      firstName: s(formData, "firstName"),
      lastName: s(formData, "lastName"),
      phone: cleanPhone(s(formData, "phone")),
      birthDate: birthDate(s(formData, "birthDate")),
      status: status as any,
      notes: s(formData, "notes"),
      approvedAt: status === "APPROVED" ? new Date() : undefined,
      bannedAt: status === "BANNED" ? new Date() : null
    }
  });

  redirect("/admin/my-clients");
}

export async function archiveClient(formData: FormData) {
  guard();
  const id = s(formData, "id");
  const reason = s(formData, "archiveReason");
  const client = await prisma.client.findUnique({ where: { id } });
  const previousNotes = client?.notes || "";
  const archiveNote = `[АРХИВ ${new Date().toLocaleDateString("ru-RU")}]${reason ? " " + reason : ""}`;

  await prisma.client.update({
    where: { id },
    data: {
      status: "REJECTED",
      notes: previousNotes ? `${previousNotes}\n${archiveNote}` : archiveNote,
      bannedAt: null
    }
  });

  redirect("/admin/my-clients");
}

export async function restoreClient(formData: FormData) {
  guard();

  await prisma.client.update({
    where: { id: s(formData, "id") },
    data: {
      status: "APPROVED",
      approvedAt: new Date(),
      bannedAt: null
    }
  });

  redirect("/admin/archive");
}
