"use server";

import { isAdmin } from "@/lib/admin";
import { cleanPhone, dateOnly, mergeClientIntoTarget, statusDates } from "@/lib/clientSync";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

function guard() {
  if (!isAdmin()) redirect("/admin/login");
}

function s(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function myClientsUrl(done: string) {
  return `/admin/my-clients?done=${encodeURIComponent(done)}`;
}

export async function saveMyClient(formData: FormData) {
  guard();

  const id = s(formData, "id");
  const status = s(formData, "status") || "APPROVED";
  const phone = cleanPhone(s(formData, "phone"));
  const current = await prisma.client.findUnique({ where: { id } });
  if (!current) redirect(myClientsUrl("not-found"));

  const existingByPhone = await prisma.client.findUnique({ where: { phone } });
  const dates = statusDates(status, current);
  const data = {
    firstName: s(formData, "firstName"),
    lastName: s(formData, "lastName"),
    phone,
    birthDate: dateOnly(s(formData, "birthDate")),
    status: status as any,
    notes: s(formData, "notes"),
    approvedAt: dates.approvedAt,
    bannedAt: dates.bannedAt
  };

  if (existingByPhone && existingByPhone.id !== id) {
    await mergeClientIntoTarget(existingByPhone.id, id, data);
    redirect(myClientsUrl("merged"));
  }

  await prisma.client.update({ where: { id }, data });
  redirect(myClientsUrl("saved"));
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

  redirect(myClientsUrl("archived"));
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

  redirect("/admin/archive?done=restored");
}
