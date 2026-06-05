"use server";

import { isAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

function guard() {
  if (!isAdmin()) redirect("/admin/login");
}

function text(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function numberValue(formData: FormData, key: string, fallback: number) {
  const parsed = Number(formData.get(key));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function createService(formData: FormData) {
  guard();

  const maxSort = await prisma.service.aggregate({ _max: { sortOrder: true } });

  await prisma.service.create({
    data: {
      title: text(formData, "title"),
      description: text(formData, "description"),
      durationMinutes: numberValue(formData, "durationMinutes", 120),
      price: numberValue(formData, "price", 0),
      sortOrder: (maxSort._max.sortOrder ?? 0) + 10,
      isActive: true
    }
  });

  redirect("/admin/services");
}

export async function updateService(formData: FormData) {
  guard();

  const id = text(formData, "id");
  await prisma.service.update({
    where: { id },
    data: {
      title: text(formData, "title"),
      description: text(formData, "description"),
      durationMinutes: numberValue(formData, "durationMinutes", 120),
      price: numberValue(formData, "price", 0),
      isActive: formData.get("isActive") === "on"
    }
  });

  redirect("/admin/services");
}

export async function moveService(formData: FormData) {
  guard();

  const id = text(formData, "id");
  const direction = text(formData, "direction");
  const service = await prisma.service.findUnique({ where: { id } });
  if (!service) redirect("/admin/services");

  await prisma.service.update({
    where: { id },
    data: { sortOrder: service.sortOrder + (direction === "up" ? -15 : 15) }
  });

  redirect("/admin/services");
}
