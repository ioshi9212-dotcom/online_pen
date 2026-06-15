import { setAdminCookie } from "@/lib/admin";
import { redirect } from "next/navigation";

async function loginAdmin(formData: FormData) {
  "use server";
  const password = String(formData.get("password") || "");
  if (password !== process.env.ADMIN_PASSWORD) redirect("/admin/login?error=1");
  setAdminCookie();
  redirect("/admin");
}

export default function AdminLoginPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <section className="card">
      <h1>Вход мастера</h1>
      <p>Служебный вход. Клиентам сюда не надо, им и так хватает испытаний.</p>
      {searchParams.error ? <div className="notice">Пароль не подошёл.</div> : null}
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
