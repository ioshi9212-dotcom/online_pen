import { isAdmin } from "@/lib/admin";
import { durationLabel } from "@/lib/durations";
import { rub } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getSettingInt } from "@/lib/schedule";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function settingValue(settings: Array<{ key: string; value: string }>, key: string, fallback = "") {
  return settings.find((item) => item.key === key)?.value || fallback;
}

function ServiceLine({ service }: { service: { id: string; title: string; durationMinutes: number; price: number; description: string } }) {
  return (
    <li className="settings-service-line">
      <div>
        <b>{service.title}</b>
        {service.description ? <small>{service.description}</small> : null}
      </div>
      <span>{durationLabel(service.durationMinutes)} · {rub(service.price)}</span>
    </li>
  );
}

export default async function AdminSettingsPage() {
  if (!isAdmin()) redirect("/admin/login");

  const [settings, rules, services] = await Promise.all([
    prisma.setting.findMany(),
    prisma.scheduleRule.findMany({ orderBy: { weekday: "asc" } }),
    prisma.service.findMany({ orderBy: [{ sortOrder: "asc" }, { title: "asc" }] })
  ]);

  const masterName = settingValue(settings, "master_name", "Мастер");
  const masterPhone = settingValue(settings, "master_phone", "");
  const stepMinutes = getSettingInt(settings, "SLOT_STEP_MINUTES", getSettingInt(settings, "slot_step_minutes", 30));
  const defaultRule = rules.find((item) => item.isWorkingDay) || rules[0];
  const defaultStartTime = defaultRule?.startTime || "09:00";
  const defaultEndTime = defaultRule?.endTime || "20:00";
  const priceVisible = services.filter((service) => service.isActive);
  const bookingVisible = services.filter((service) => service.isActive && service.showInBooking);

  return (
    <main className="admin-settings-page grid">
      <style>{`
        .admin-settings-page { gap: 14px; }
        .settings-hero { padding: 18px !important; }
        .settings-hero h1 { margin: 0 0 6px; }
        .settings-card { padding: 16px 18px !important; }
        .settings-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
        .settings-card-head h2 { margin: 0 0 4px; font-size: 20px; line-height: 1.2; }
        .settings-card-head p { margin: 0; color: #75616b; font-size: 14px; }
        .settings-card-head .button { min-height: 34px; padding: 8px 12px; border-radius: 12px; white-space: nowrap; }
        .settings-mini-list { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
        .settings-mini-line { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid rgba(80, 58, 68, .12); font-size: 14px; }
        .settings-mini-line:last-child { border-bottom: 0; }
        .settings-mini-line span { color: #75616b; }
        .settings-price-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .settings-price-block h3 { margin: 0 0 8px; font-size: 15px; line-height: 1.2; }
        .settings-service-list { display: grid; gap: 0; margin: 0; padding: 0; list-style: none; }
        .settings-service-line { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid rgba(80, 58, 68, .12); font-size: 14px; }
        .settings-service-line:last-child { border-bottom: 0; }
        .settings-service-line b { display: block; font-weight: 600; }
        .settings-service-line small { display: block; margin-top: 2px; color: #806b75; font-size: 12px; }
        .settings-service-line span { flex: 0 0 auto; color: #5f4c55; white-space: nowrap; }
        .settings-empty { padding: 8px 0; color: #806b75; font-size: 14px; }
        @media (max-width: 760px) {
          .settings-card { padding: 14px 16px !important; }
          .settings-card-head { align-items: center; }
          .settings-card-head h2 { font-size: 18px; }
          .settings-price-grid { grid-template-columns: 1fr; gap: 12px; }
          .settings-service-line { display: grid; gap: 4px; }
          .settings-service-line span { white-space: normal; }
        }
      `}</style>

      <section className="card settings-hero">
        <p className="eyebrow">Кабинет мастера</p>
        <h1>Настройки</h1>
        <p>Здесь собраны основные вещи: запись, профиль мастера и прайс.</p>
      </section>

      <section className="card settings-card">
        <div className="settings-card-head">
          <div>
            <h2>Настройка записи</h2>
            <p>Шаг времени и обычные рабочие часы.</p>
          </div>
          <a className="button secondary" href="/admin/schedule?view=mode">Редактировать</a>
        </div>
        <ul className="settings-mini-list">
          <li className="settings-mini-line"><b>Шаг календаря</b><span>{stepMinutes} минут</span></li>
          <li className="settings-mini-line"><b>Рабочий день</b><span>{defaultStartTime}–{defaultEndTime}</span></li>
        </ul>
      </section>

      <section className="card settings-card">
        <div className="settings-card-head">
          <div>
            <h2>Профиль мастера</h2>
            <p>Имя, телефон, фото и пароль входа.</p>
          </div>
          <a className="button secondary" href="/admin/profile">Редактировать</a>
        </div>
        <ul className="settings-mini-list">
          <li className="settings-mini-line"><b>Имя</b><span>{masterName}</span></li>
          <li className="settings-mini-line"><b>Телефон</b><span>{masterPhone || "не указан"}</span></li>
        </ul>
      </section>

      <section className="card settings-card">
        <div className="settings-card-head">
          <div>
            <h2>Мой прайс</h2>
            <p>Услуги можно показывать в прайсе, а для записи оставить только основные.</p>
          </div>
          <a className="button secondary" href="/admin/services">Редактировать</a>
        </div>
        <div className="settings-price-grid">
          <div className="settings-price-block">
            <h3>Для записи онлайн</h3>
            {bookingVisible.length ? (
              <ul className="settings-service-list">
                {bookingVisible.map((service) => <ServiceLine key={service.id} service={service} />)}
              </ul>
            ) : <div className="settings-empty">Пока нет услуг для онлайн-записи.</div>}
          </div>
          <div className="settings-price-block">
            <h3>В прайсе</h3>
            {priceVisible.length ? (
              <ul className="settings-service-list">
                {priceVisible.map((service) => <ServiceLine key={service.id} service={service} />)}
              </ul>
            ) : <div className="settings-empty">Прайс пока пуст.</div>}
          </div>
        </div>
      </section>
    </main>
  );
}
