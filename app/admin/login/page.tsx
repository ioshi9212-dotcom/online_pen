import { verifyAdminPassword } from "@/lib/adminPassword";
import { setAdminCookie } from "@/lib/admin";
import { checkRateLimit, resetRateLimit } from "@/lib/rateLimit";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

function requestIp() {
  const h = headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip") || "unknown";
}

function safeNext(value: FormDataEntryValue | null) {
  const text = String(value || "").trim();
  return text.startsWith("/admin") && !text.startsWith("/admin/login") ? text : "/admin";
}

async function loginAdmin(formData: FormData) {
  "use server";

  const ip = requestIp();
  const limitKey = `admin-login:${ip}`;
  const limit = checkRateLimit(limitKey, {
    limit: 6,
    windowMs: 10 * 60 * 1000,
    blockMs: 10 * 60 * 1000
  });

  if (!limit.ok) redirect("/admin/login?limited=1");

  const password = String(formData.get("password") || "");
  const ok = await verifyAdminPassword(password);

  if (!ok) redirect("/admin/login?error=1");

  resetRateLimit(limitKey);
  setAdminCookie();
  redirect(safeNext(formData.get("next")));
}

export default function AdminLoginPage({ searchParams }: { searchParams: { error?: string; limited?: string; next?: string } }) {
  return (
    <section className="card auth-card">
      <h1>Вход мастера</h1>
      <p>Служебный вход. Клиентам сюда не надо, им и так хватает испытаний.</p>
      {searchParams.error ? <div className="notice danger-notice">Пароль не подошёл.</div> : null}
      {searchParams.limited ? <div className="notice danger-notice">Слишком много попыток. Подождите несколько минут и попробуйте снова.</div> : null}
      <form action={loginAdmin} className="grid">
        <input type="hidden" name="next" value={searchParams.next || ""} />
        <label>Пароль админки<input name="password" type="password" required /></label>
        <div className="actions">
          <button type="submit">Войти</button>
          <a className="button secondary" href="/">На главную</a>
        </div>
      </form>
    </section>
  );
}
