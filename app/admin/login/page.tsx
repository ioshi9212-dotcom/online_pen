import { verifyAdminPassword } from "@/lib/adminPassword";
import { isAdmin, setAdminCookie } from "@/lib/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

async function loginAdmin(formData: FormData) {
  "use server";
  const password = String(formData.get("password") || "");
  const requestHeaders = headers();
  const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip") || "unknown";
  const allowed = checkRateLimit(`admin-login:${ip}`, { limit: 6, windowMs: 15 * 60_000, blockMs: 30 * 60_000 });
  if (!allowed.ok) redirect("/admin/login?error=rate-limit");
  const ok = await verifyAdminPassword(password);
  if (!ok) redirect("/admin/login?error=1");
  setAdminCookie();
  redirect("/admin");
}

export default function AdminLoginPage({ searchParams }: { searchParams: { error?: string; passwordChanged?: string } }) {
  if (isAdmin()) redirect("/admin");

  return (
    <section className="card auth-card">
      <h1>Вход мастера</h1>
      <p>Служебный вход. Клиентам сюда не надо, им и так хватает испытаний.</p>
      {searchParams.error === "rate-limit" ? <div className="notice danger-notice">Слишком много попыток. Вход временно заблокирован.</div> : null}
      {searchParams.error && searchParams.error !== "rate-limit" ? <div className="notice danger-notice">Пароль не подошёл.</div> : null}
      {searchParams.passwordChanged ? <div className="notice ok-notice">Пароль изменён. Войдите заново.</div> : null}
      <form action={loginAdmin} className="grid">
        <label>Пароль админки<input name="password" type="password" required /></label>
        <div className="actions">
          <button type="submit">Войти</button>
          <a className="button secondary" href="/">На главную</a>
        </div>
      </form>
    </section>
  );
}
