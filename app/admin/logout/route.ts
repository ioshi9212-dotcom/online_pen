import { clearAdminCookie } from "@/lib/admin";
import { redirect } from "next/navigation";

export async function GET() {
  await clearAdminCookie();
  redirect("/admin/login");
}
