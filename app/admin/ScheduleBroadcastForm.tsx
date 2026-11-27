"use client";

import { useState, type FormEvent } from "react";

type Props = { clientCount: number; subscribedClients: number; subscribedDevices: number };
type Result = { ok?: boolean; error?: string; accepted?: number; failed?: number; devices?: number; published?: boolean; pushEnabled?: boolean };

export default function ScheduleBroadcastForm({ clientCount, subscribedClients, subscribedDevices }: Props) {
  const [title, setTitle] = useState("Открыта запись");
  const [body, setBody] = useState("Расписание опубликовано! Свободные окна уже можно выбрать в личном кабинете.");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!window.confirm("Опубликовать объявление в кабинетах и отправить push всем подписанным клиентам?")) return;
    setSending(true); setResult("");
    try {
      const response = await fetch("/api/admin/schedule-broadcast", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body })
      });
      const data: Result = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Не удалось отправить объявление.");
      const outcome = data.pushEnabled
        ? `Push принят провайдерами: ${data.accepted ?? 0} из ${data.devices ?? 0} устройств. Ошибок: ${data.failed ?? 0}.`
        : "Push не настроен в Amvera: на телефоны ничего не отправлено.";
      setResult("Объявление опубликовано в личных кабинетах. " + outcome);
    } catch (error) {
      setResult(error instanceof Error ? error.message : "Не удалось опубликовать объявление.");
    } finally { setSending(false); }
  }

  return (
    <section className="card schedule-broadcast-panel" aria-label="Рассылка об открытии расписания">
      <h2>Сообщить об открытии расписания</h2>
      <p className="muted">Напиши свой текст и нажми кнопку, когда откроешь даты. Автоматически при изменении расписания ничего не отправляется.</p>
      <p className="muted schedule-broadcast-counts">Зарегистрировано: <b>{clientCount}</b> · Включили push: <b>{subscribedClients}</b> клиентов, <b>{subscribedDevices}</b> устройств.</p>
      <p className="muted">Объявление увидят все зарегистрированные при входе. На телефон сообщение придёт только тем, кто разрешил уведомления. Отклонённым и заблокированным рассылка не отправляется.</p>
      <form onSubmit={submit} className="schedule-broadcast-form">
        <label>Заголовок уведомления
          <input type="text" maxLength={80} required value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>Текст уведомления
          <textarea rows={3} maxLength={240} minLength={5} required value={body} onChange={(e) => setBody(e.target.value)} />
        </label>
        <button type="submit" disabled={sending}>{sending ? "Отправляю…" : "Отправить уведомление о расписании"}</button>
      </form>
      {result ? <p className="notice" role="status" aria-live="polite">{result}</p> : null}
      <small className="muted">Повторная рассылка доступна не раньше чем через 5 минут. Количество принятых push не гарантирует показ на экране.</small>
    </section>
  );
}
