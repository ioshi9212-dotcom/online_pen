import { clearClientCookie } from "@/lib/clientSession";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export function GET() {
  clearClientCookie();
  redirect("/login?logout=1");
}
