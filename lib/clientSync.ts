import { prisma } from "@/lib/prisma";

export function cleanPhone(value: string) {
  return value.replace(/[^0-9+]/g, "").trim();
}

export function dateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

export function mergeNotes(...parts: Array<string | null | undefined>) {
  const clean = parts
    .map((part) => String(part || "").trim())
    .filter(Boolean);

  return Array.from(new Set(clean)).join("\n");
}

export function statusDates(status: string, existing?: { approvedAt?: Date | null; bannedAt?: Date | null }) {
  return {
    approvedAt: status === "APPROVED" ? existing?.approvedAt ?? new Date() : existing?.approvedAt ?? null,
    bannedAt: status === "BANNED" ? existing?.bannedAt ?? new Date() : null
  };
}

type ClientUpdateData = {
  firstName: string;
  lastName: string;
  phone: string;
  birthDate: Date;
  status: any;
  notes: string;
  approvedAt?: Date | null;
  bannedAt?: Date | null;
};

export async function mergeClientIntoTarget(sourceId: string, targetId: string, targetData: ClientUpdateData) {
  if (sourceId === targetId) {
    return prisma.client.update({ where: { id: targetId }, data: targetData });
  }

  return prisma.$transaction(async (tx) => {
    const [source, target] = await Promise.all([
      tx.client.findUnique({ where: { id: sourceId } }),
      tx.client.findUnique({ where: { id: targetId } })
    ]);

    if (!source || !target) throw new Error("Клиент для объединения не найден");

    await tx.booking.updateMany({ where: { clientId: sourceId }, data: { clientId: targetId } });
    await tx.waitlistEntry.updateMany({ where: { clientId: sourceId }, data: { clientId: targetId } });
    await tx.client.delete({ where: { id: sourceId } });

    return tx.client.update({
      where: { id: targetId },
      data: {
        ...targetData,
        notes: mergeNotes(target.notes, source.notes, targetData.notes)
      }
    });
  });
}

export async function upsertClientByPhone(data: ClientUpdateData) {
  const existing = await prisma.client.findUnique({ where: { phone: data.phone } });

  if (!existing) {
    const created = await prisma.client.create({ data });
    return { client: created, mode: "created" as const };
  }

  const updated = await prisma.client.update({
    where: { id: existing.id },
    data: {
      ...data,
      notes: mergeNotes(existing.notes, data.notes),
      approvedAt: data.status === "APPROVED" ? existing.approvedAt ?? new Date() : existing.approvedAt,
      bannedAt: data.status === "BANNED" ? existing.bannedAt ?? new Date() : null
    }
  });

  return { client: updated, mode: "merged" as const };
}
