import { isAdmin } from "@/lib/admin";
import { replaceOnlineWindows, WindowError } from "@/lib/onlineWindows";
import { sameOriginRequest } from "@/lib/sameOrigin";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ ok: false, error: "Войдите в кабинет мастера" }, { status: 401 });
  if (!sameOriginRequest(request)) return NextResponse.json({ ok: false, error: "Недопустимый запрос" }, { status: 403 });
  const body = await request.json().catch(() => null);
  try {
    const result = await replaceOnlineWindows(String(body?.date || ""), body?.times);
    revalidatePath("/admin/schedule");
    revalidatePath("/my");
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof WindowError) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    console.error("Online-window save failed", error);
    return NextResponse.json({ ok: false, error: "Не удалось сохранить окна. Прежние окна сохранены; попробуйте ещё раз." }, { status: 500 });
  }
}
