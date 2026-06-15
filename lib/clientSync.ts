import { ClientStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/phone";

type ClientInput = {
  firstName: string;
  lastName: string;
  phone: string;
  birthDate: Date;
  status?: ClientStatus | string;
  notes?: string;
};

function cleanText(value: string) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function mergeNotes(...items: Array<string | null | undefined>) {
  const parts = items
    .map((item) => String(item || "").trim())
    .filter(Boolean);

  return Array.from(new Set(parts)).join("\n");
}

function publicStatus(existingStatus: ClientStatus) {
  if (existingStatus === "APPROVED") return "APPROVED";
  if (existingStatus === "BANNED") return "BANNED";
  return "PENDING";
}

export async function moveClientLinks(sourceId: string, targetId: string) {
  if (!sourceId || !targetId || sourceId === targetId) return;

  await prisma.booking.updateMany({ where: { clientId: sourceId }, data: { clientId: targetId } });
  await prisma.waitlistEntry.updateMany({ where: { clientId: sourceId }, data: { clientId: targetId } });
}

export async function upsertManualClient(input: ClientInput) {
  const phone = normalizePhone(input.phone);
  const status = (input.status || "APPROVED") as ClientStatus;
  const existing = await prisma.client.findUnique({ where: { phone } });

  if (existing) {
    const client = await prisma.client.update({
      where: { id: existing.id },
      data: {
        firstName: cleanText(input.firstName),
        lastName: cleanText(input.lastName),
        birthDate: input.birthDate,
        status,
        notes: mergeNotes(existing.notes, input.notes),
        approvedAt: status === "APPROVED" ? existing.approvedAt ?? new Date() : existing.approvedAt,
        bannedAt: status === "BANNED" ? new Date() : null
      }
    });

    return { client, mode: "merged" as const };
  }

  const client = await prisma.client.create({
    data: {
      firstName: cleanText(input.firstName),
      lastName: cleanText(input.lastName),
      phone,
      birthDate: input.birthDate,
      status,
      notes: cleanText(input.notes || ""),
      approvedAt: status === "APPROVED" ? new Date() : null,
      bannedAt: status === "BANNED" ? new Date() : null
    }
  });

  return { client, mode: "created" as const };
}

export async function syncPublicRegistration(input: ClientInput) {
  const phone = normalizePhone(input.phone);
  const existing = await prisma.client.findUnique({ where: { phone } });

  if (existing) {
    const nextStatus = publicStatus(existing.status);
    const client = await prisma.client.update({
      where: { id: existing.id },
      data: {
        firstName: cleanText(input.firstName),
        lastName: cleanText(input.lastName),
        birthDate: input.birthDate,
        status: nextStatus,
        notes: mergeNotes(existing.notes, input.notes),
        approvedAt: nextStatus === "APPROVED" ? existing.approvedAt ?? new Date() : existing.approvedAt,
        bannedAt: nextStatus === "BANNED" ? existing.bannedAt ?? new Date() : null
      }
    });

    return { client, mode: "existing" as const };
  }

  const client = await prisma.client.create({
    data: {
      firstName: cleanText(input.firstName),
      lastName: cleanText(input.lastName),
      phone,
      birthDate: input.birthDate,
      notes: cleanText(input.notes || ""),
      status: "PENDING"
    }
  });

  return { client, mode: "created" as const };
}

export async function saveAdminClient(input: ClientInput & { id: string }) {
  const phone = normalizePhone(input.phone);
  const status = (input.status || "APPROVED") as ClientStatus;
  const current = await prisma.client.findUniqueOrThrow({ where: { id: input.id } });
  const duplicate = await prisma.client.findUnique({ where: { phone } });
  const data = {
    firstName: cleanText(input.firstName),
    lastName: cleanText(input.lastName),
    phone,
    birthDate: input.birthDate,
    status,
    notes: cleanText(input.notes || ""),
    approvedAt: status === "APPROVED" ? current.approvedAt ?? new Date() : current.approvedAt,
    bannedAt: status === "BANNED" ? current.bannedAt ?? new Date() : null
  };

  if (duplicate && duplicate.id !== current.id) {
    await moveClientLinks(duplicate.id, current.id);
    await prisma.client.delete({ where: { id: duplicate.id } });
    const client = await prisma.client.update({
      where: { id: current.id },
      data: {
        ...data,
        notes: mergeNotes(current.notes, duplicate.notes, input.notes)
      }
    });
    return { client, mode: "merged" as const };
  }

  const client = await prisma.client.update({ where: { id: current.id }, data });
  return { client, mode: "saved" as const };
}
