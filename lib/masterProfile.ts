import { prisma } from "@/lib/prisma";

export async function getMasterProfile() {
  const rows = await prisma.setting.findMany({ where: { key: { in: ["master_name", "master_phone", "master_photo_url", "master_location"] } } });
  const value = (key: string) => rows.find((row) => row.key === key)?.value || "";
  const phone = value("master_phone");
  const digits = phone.replace(/\D/g, "");
  return { name: value("master_name") || "Мастер", phone, photo: value("master_photo_url"), location: value("master_location"), whatsapp: digits.length >= 10 ? `https://wa.me/${digits.startsWith("8") && digits.length === 11 ? "7" + digits.slice(1) : digits}` : "" };
}
