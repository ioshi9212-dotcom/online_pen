import { clearClientCookie } from "@/lib/clientSession";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export async function GET() {
  await clearClientCookie();
  redirect("/login?logout=1");
}
