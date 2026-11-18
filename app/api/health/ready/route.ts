import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { sessionSecret } from "@/lib/signedSession";
export const dynamic = "force-dynamic";
export async function GET() {
  try { sessionSecret("admin"); sessionSecret("client"); await prisma.client.findFirst({ select: { id: true } }); return NextResponse.json({ status: "ready" }); }
  catch { return NextResponse.json({ status: "unavailable" }, { status: 503 }); }
}
