import { isAdmin } from "@/lib/admin";
import { applyWindowPreset, saveWindowPreset, WindowPresetError } from "@/lib/windowPresets";
import { sameOriginRequest } from "@/lib/sameOrigin";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!sameOriginRequest(request))
    return NextResponse.json({ ok: false, error: "Недопустимый запрос." }, { status: 403 });
  if (!(await isAdmin()))
    return NextResponse.json({ ok: false, error: "Войдите в кабинет мастера." }, { status: 401 });
  const data = await request.json().catch(() => null);
  try {
    if (data?.action === "save") {
      const preset = await saveWindowPreset(data.index, data.name, data.times);
      revalidatePath("/admin/schedule");
      return NextResponse.json({ ok: true, preset });
    }
    if (data?.action === "apply") {
      if (typeof data.date !== "string") throw new WindowPresetError("Проверьте дату.");
      const result = await applyWindowPreset(data.date, data.index);
      for (const path of ["/admin/schedule", "/admin/schedule/free", "/admin", "/my"])
        revalidatePath(path);
      return NextResponse.json({ ok: true, ...result });
    }
    return NextResponse.json({ ok: false, error: "Неизвестное действие." }, { status: 400 });
  } catch (error) {
    if (error instanceof WindowPresetError)
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    console.error("Window preset request failed", error);
    return NextResponse.json({ ok: false, error: "Не удалось выполнить действие. Проверьте подключение." }, { status: 500 });
  }
}
