import SubmitButton from "@/app/SubmitButton";
import { registerClient } from "@/app/actions";

export default async function RegisterPage({ searchParams: searchParamsPromise }: { searchParams: Promise<{ phone?: string; rejected?: string; error?: string }> }) {
  const searchParams = (await searchParamsPromise) || {};

  const rejected = searchParams.rejected === "1";

  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="muted">Новая заявка</p>
        <h1>Регистрация</h1>
        <p>Заполните форму. Мастер подтвердит заявку и откроет доступ к записи.</p>

        <div className="notice test-version-note">
          <b>Сайт в тестовом режиме</b>
          <p>После записи напишите мастеру для проверки.</p>
        </div>

        {rejected ? (
          <div className="notice danger-notice">
            Предыдущая заявка была отклонена мастером. Можно заполнить форму заново и отправить новую заявку.
          </div>
        ) : (
          <div className="notice">
            Уже оставляли заявку? Нажмите «Войти», чтобы проверить статус.
          </div>
        )}
        {searchParams.error ? <div className="notice danger-notice">Проверьте имя, фамилию, телефон и дату рождения.</div> : null}
        <form action={registerClient} className="grid">
          <div className="grid-2">
            <label>Имя<input name="firstName" autoComplete="given-name" required /></label>
            <label>Фамилия<input name="lastName" autoComplete="family-name" required /></label>
          </div>
          <div className="grid-2">
            <label>Телефон<input name="phone" type="tel" autoComplete="tel" required defaultValue={searchParams.phone || ""} /></label>
            <label>Дата рождения<input name="birthDate" required type="date" /></label>
          </div>
          <label>Комментарий — необязательно<textarea name="comment" /></label>
          <div className="actions">
            <SubmitButton pendingText="Отправляю…">Отправить заявку</SubmitButton>
            <a className="button secondary" href="/login">Войти</a>
          </div>
        </form>
      </section>
    </main>
  );
}
