import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { notifyClient } from "@/lib/pushNotifications";
import { formatInBusinessTime } from "@/lib/timezone";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * External scheduler invokes POST hourly with Authorization:
 * Bearer <PUSH_CRON_SECRET>. App containers have no reliable background timer.
 */
export async function POST(request: Request) {
  const secret = process.env.PUSH_CRON_SECRET || "";
  const supplied = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(secret), b = Buffer.from(supplied);
  if (secret.length < 32) return NextResponse.json({ok:false,error:"Cron not configured"},{status:503});
  if (a.length !== b.length || !timingSafeEqual(a,b)) return NextResponse.json({ok:false},{status:401});

  const now = new Date();
  const lower = new Date(now.getTime() + 23 * 60 * 60_000);
  const upper = new Date(now.getTime() + 25 * 60 * 60_000);
  const upcoming = await prisma.booking.findMany({
    where:{ status:"CONFIRMED",startAt:{gte:lower,lte:upper} },
    select:{id:true,clientId:true,startAt:true,service:{select:{title:true}}},
    take:200
  });
  let delivered = 0;
  for(const booking of upcoming) {
    const key="push-reminder:"+booking.id+":"+booking.startAt.toISOString();
    if(await prisma.setting.findUnique({where:{key}}))continue;
    const when=formatInBusinessTime(booking.startAt,{day:"2-digit",month:"long",hour:"2-digit",minute:"2-digit"});
    const count=await notifyClient(booking.clientId,{
      title:"Напоминание о записи",
      body:booking.service.title+" — "+when,
      url:"/my#upcoming-booking",
      tag:"reminder-"+booking.id
    });
    if(count>0) {
      await prisma.setting.upsert({where:{key},create:{key,value:"sent"},update:{value:"sent"}});
      delivered+=count;
    }
  }
  return NextResponse.json({ok:true,checked:upcoming.length,delivered});
}
