"use server";

import { isAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { saveAdminClient, upsertManualClient } from "@/lib/clientSync";
import { normalizePhone } from "@/lib/phone";
import { redirect } from "next/navigation";

function guard() {
  if (!isAdmin()) redirect("/admin/login");
}

function s(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function birthDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function clientsUrl(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const query = search.toString();
  return query ? `/admin/my-clients?${query}` : "/admin/my-clients";
}

function profileUrl(id: string, params: Record<string, string | undefined> = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const query = search.toString();
  return query ? `/admin/my-clients/${id}?${query}` : `/admin/my-clients/${id}`;
}

export async function createMyClient(formData: FormData) {
  guard();
  const status = s(formData, "status") || "APPROVED";

  const result = await upsertManualClient({
    firstName: s(formData, "firstName"),
    lastName: s(formData, "lastName"),
    phone: normalizePhone(s(formData, "phone")),
    birthDate: birthDate(s(formData, "birthDate")),
    status,
    notes: s(formData, "notes")
  });

  redirect(clientsUrl({ saved: result.mode, clientId: result.client.id }));
}

export async function saveMyClient(formData: FormData) {
  guard();
  const status = s(formData, "status") || "APPROVED";

  const result = await saveAdminClient({
    id: s(formData, "id"),
    firstName: s(formData, "firstName"),
    lastName: s(formData, "lastName"),
    phone: normalizePhone(s(formData, "phone")),
    birthDate: birthDate(s(formData, "birthDate")),
    status,
    notes: s(formData, "notes")
  });

  const redirectTo = s(formData, "redirectTo");
  if (redirectTo === "profile") redirect(profileUrl(s(formData, "id"), { saved: result.mode }));
  redirect(clientsUrl({ saved: result.mode, clientId: s(formData, "id") }));
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

  redirect(clientsUrl({ saved: "archived" }));
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
