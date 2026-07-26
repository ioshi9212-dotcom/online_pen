import { registerClient } from "@/app/actions";

type SearchParams = {
  phone?: string;
  rejected?: string;
  error?: string;
};

export default function RegisterPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="client-v2 auth-v2">
      <section className="auth-v2-card">
        <div className="auth-v2-heading">
          <span className="client-v2-kicker">Шаг 1 из 3</span>
          <h1>Запросить доступ к расписанию</h1>
          <p>Мастер проверит заявку и откроет свободные окна. Это ещё не запись на услугу.</p>
        </div>

        <div className="auth-v2-inline-step">
          <i>1</i>
          <span><b>Сейчас</b><small>Вы отправляете заявку на доступ</small></span>
          <em>→</em>
          <i>2</i>
          <span><b>Дальше</b><small>Мастер напишет, когда доступ открыт</small></span>
        </div>

        {searchParams.rejected === "1" ? (
          <div className="client-v2-flash is-error">Предыдущая заявка не была одобрена. Можно отправить новую.</div>
        ) : null}
        {searchParams.error === "too-many-attempts" ? (
          <div className="client-v2-flash is-error">Слишком много попыток. Подождите 15 минут и попробуйте снова.</div>
        ) : null}

        <form action={registerClient} className="client-v2-form auth-v2-form">
          <div className="client-v2-form-grid">
            <label>Имя<input name="firstName" autoComplete="given-name" required /></label>
            <label>Фамилия<input name="lastName" autoComplete="family-name" required /></label>
          </div>
          <label>Телефон<input name="phone" type="tel" autoComplete="tel" required defaultValue={searchParams.phone || ""} placeholder="+7 900 000-00-00" /></label>
          <label>Дата рождения<input name="birthDate" required type="date" autoComplete="bday" /></label>
          <label>Комментарий <small>необязательно</small><textarea name="comment" placeholder="Например: раньше записывалась через WhatsApp" /></label>
          <button type="submit">Запросить доступ</button>
        </form>

        <p className="auth-v2-switch">Уже отправляли заявку? <a href="/login">Проверить доступ</a></p>
      </section>
    </main>
  );
}
