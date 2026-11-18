import { isAdmin } from "@/lib/admin";
import { scheduleTransaction } from "@/lib/scheduleTransaction";
import { sameOriginRequest } from "@/lib/sameOrigin";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  if (!sameOriginRequest(request)) return NextResponse.json({ ok: false }, { status: 403 });

  const body = await request.json().catch(() => null) as { id?: string } | null;
  const id = String(body?.id || "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "missing-id" }, { status: 400 });

  await scheduleTransaction((tx) => tx.onlineWindow.deleteMany({ where: { id } }));
  revalidatePath("/admin/schedule");
  revalidatePath("/my");

  return NextResponse.json({ ok: true });
}
