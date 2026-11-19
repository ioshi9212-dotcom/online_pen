import { pushConfiguration } from "@/lib/webPush";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export function GET() {
  try {
    const config = pushConfiguration();
    return NextResponse.json({ enabled: Boolean(config), publicKey: config?.publicKey || "" }, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch {
    return NextResponse.json({ enabled: false, publicKey: "" }, { headers: { "Cache-Control": "no-store" } });
  }
}
