import { isAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  if (!isAdmin()) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as { id?: string } | null;
  const id = String(body?.id || "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "missing-id" }, { status: 400 });

  await prisma.onlineWindow.deleteMany({ where: { id } });

  return NextResponse.json({ ok: true });
}
