import { clearAdminCookie } from "@/lib/admin";
import { redirect } from "next/navigation";

export async function GET() {
  clearAdminCookie();
  redirect("/admin/login");
}
