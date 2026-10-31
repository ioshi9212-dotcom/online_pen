import { verifyAdminPassword } from "@/lib/adminPassword";
import { isAdmin, setAdminCookie } from "@/lib/admin";
import { redirect } from "next/navigation";
import { allowAuthAttempt } from "@/lib/authRateLimit";
import SubmitButton from "@/app/SubmitButton";

async function loginAdmin(formData: FormData) {
  "use server";
  const password = String(formData.get("password") || "");
  if (!(await allowAuthAttempt("admin"))) redirect("/admin/login?error=rate");
  const ok = await verifyAdminPassword(password);
  if (!ok) redirect("/admin/login?error=1");
  await setAdminCookie(ok);
  redirect("/admin");
}

export default async function AdminLoginPage({ searchParams: searchParamsPromise }: { searchParams: Promise<{ error?: string }> }) {
  const searchParams = (await searchParamsPromise) || {};

  if (await isAdmin()) redirect("/admin");

  return (
    <section className="card auth-card">
      <h1>Вход мастера</h1>
      <p>Введите пароль, чтобы открыть расписание и записи клиентов.</p>
      {searchParams.error ? <div className="notice danger-notice">{searchParams.error === "rate" ? "Слишком много попыток. Попробуйте через 30 минут." : "Пароль не подошёл."}</div> : null}
      <form action={loginAdmin} className="grid">
        <label>Пароль<input name="password" type="password" autoComplete="current-password" required /></label>
        <div className="actions">
          <SubmitButton pendingText="Вхожу…">Войти</SubmitButton>
          <a className="button secondary" href="/">На главную</a>
        </div>
      </form>
    </section>
  );
}
