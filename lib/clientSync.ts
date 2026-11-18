import { ClientStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/phone";
import { scheduleTransaction } from "@/lib/scheduleTransaction";

export type ClientInput = { firstName: string; lastName: string; phone: string; birthDate: Date; status?: ClientStatus | string; notes?: string };
const clean = (value: string) => String(value || "").trim().replace(/\s+/g, " ");
const mergeNotes = (...items: Array<string | undefined>) => Array.from(new Set(items.map((value) => (value || "").trim()).filter(Boolean))).join("\n");

export class DuplicateClientError extends Error {
  constructor(public duplicateId: string) { super("Этот телефон уже есть в другой карточке"); }
}

function clientData(input: ClientInput) {
  const status = (input.status || "APPROVED") as ClientStatus;
  const phone = normalizePhone(input.phone);
  if (!clean(input.firstName) || !clean(input.lastName) || phone.replace(/\D/g, "").length < 10 || !Number.isFinite(input.birthDate.getTime()) || input.birthDate > new Date() || !Object.values(ClientStatus).includes(status)) throw new Error("Проверьте данные клиента");
  return { firstName: clean(input.firstName), lastName: clean(input.lastName), phone, birthDate: input.birthDate, status, notes: (input.notes || "").trim() };
}

export async function upsertManualClient(input: ClientInput) {
  const data = clientData(input);
  // A repeated phone must not silently overwrite an existing person's profile.
  const result = await prisma.client.createMany({ data: [{ ...data, approvedAt: data.status === "APPROVED" ? new Date() : null, bannedAt: data.status === "BANNED" ? new Date() : null }], skipDuplicates: true });
  const client = await prisma.client.findUniqueOrThrow({ where: { phone: data.phone } });
  return { client, mode: result.count ? "created" as const : "existing" as const };
}

export async function syncPublicRegistration(input: ClientInput) {
  const data = clientData({ ...input, status: "PENDING" });
  const result = await prisma.client.createMany({ data: [data], skipDuplicates: true });
  const client = await prisma.client.findUniqueOrThrow({ where: { phone: data.phone } });
  return { client, mode: result.count ? "created" as const : "existing" as const };
}

export async function saveAdminClient(input: ClientInput & { id: string; mergeClientId?: string }) {
  const data = clientData(input);
  return scheduleTransaction(async (tx) => {
    const current = await tx.client.findUniqueOrThrow({ where: { id: input.id } });
    const duplicate = await tx.client.findUnique({ where: { phone: data.phone } });
    if (duplicate && duplicate.id !== current.id) {
      if (input.mergeClientId !== duplicate.id) throw new DuplicateClientError(duplicate.id);
      await tx.booking.updateMany({ where: { clientId: duplicate.id }, data: { clientId: current.id } });
      await tx.waitlistEntry.updateMany({ where: { clientId: duplicate.id }, data: { clientId: current.id } });
      await tx.client.delete({ where: { id: duplicate.id } });
    }
    const client = await tx.client.update({ where: { id: current.id }, data: {
      ...data,
      notes: duplicate && duplicate.id !== current.id ? mergeNotes(current.notes, duplicate.notes, input.notes) : data.notes,
      approvedAt: data.status === "APPROVED" ? current.approvedAt ?? new Date() : current.approvedAt,
      bannedAt: data.status === "BANNED" ? current.bannedAt ?? new Date() : null
    } });
    return { client, mode: duplicate && duplicate.id !== current.id ? "merged" as const : "saved" as const };
  });
}
