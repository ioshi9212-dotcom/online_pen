import { isAdmin } from "@/lib/admin";
import { getClientCookie, getPendingCookie } from "@/lib/clientSession";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { sameOriginRequest } from "@/lib/sameOrigin";
import { sendWebPush } from "@/lib/webPush";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return NextResponse.json({ ok: false }, { status: 403 });
  const body = await request.json().catch(() => null);
  const role = body?.role;
  if (role !== "admin" && role !== "client") return NextResponse.json({ ok: false }, { status: 400 });
  let owner: { isAdmin: boolean; clientId: string | null };
  if (role === "admin") {
    if (!(await isAdmin())) return NextResponse.json({ ok: false }, { status: 401 });
    owner = { isAdmin: true, clientId: null };
  } else {
    const approvedToken = await getClientCookie();
    const pendingToken = await getPendingCookie();
    const client = await prisma.client.findFirst({ where: { OR: [
      ...(approvedToken ? [{publicToken:approvedToken,status:"APPROVED" as const}] : []),
      ...(pendingToken ? [{publicToken:pendingToken,status:"PENDING" as const}] : [])
    ] }, select: {id:true} });
    if (!client) return NextResponse.json({ ok: false }, { status: 401 });
    owner = { isAdmin: false, clientId: client.id };
  }
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  const saved = await prisma.pushSubscription.findFirst({ where: { endpoint, ...owner } });
  if (!saved) return NextResponse.json({ ok: false, error: "Сначала включите уведомления" }, { status: 404 });
  const key = "push-test:" + createHash("sha256").update(saved.id).digest("hex");
  const previous = await prisma.setting.findUnique({ where: {key} });
  if (previous && previous.updatedAt.getTime() > Date.now() - 60000)
    return NextResponse.json({ok:false,error:"Повторите тест через минуту."},{status:429});
  await prisma.setting.upsert({where:{key},create:{key,value:"sent"},update:{value:"sent"}});
  try {
    const result = await sendWebPush(
      {endpoint: saved.endpoint,keys:{p256dh:saved.p256dh,auth:saved.auth}},
      {title:"Online Pen",body:"Тестовое уведомление: всё подключено! 💅",url:role==="admin"?"/admin":"/my",tag:"push-test"}
    );
    if (result.expired) {
      await prisma.pushSubscription.delete({ where: { id: saved.id } });
      return NextResponse.json({ok:false,error:"Подписка истекла. Подключите уведомления снова."},{status:410});
    }
    if (!result.delivered) return NextResponse.json({ok:false,error:"Push не настроен на сервере"},{status:503});
    return NextResponse.json({ok:true});
  } catch (error) {
    console.warn("Push self-test:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ok:false,error:"Служба push недоступна. Посмотрите журнал Amvera."},{status:502});
  }
}
