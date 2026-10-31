"use client";

import { useActionState, useState } from "react";
import { saveMyClient } from "../actions";
import { normalizePhone } from "@/lib/phone";
import { CLIENT_STATUS_OPTIONS } from "@/lib/statusLabels";
import SubmitButton from "@/app/SubmitButton";

type ClientData = { id: string; firstName: string; lastName: string; phone: string; birthDate: string; status: string; notes: string };
export default function ClientEditor({ client }: { client: ClientData }) {
  const [state, action] = useActionState(saveMyClient, { error: "", duplicate: null });
  const [data, setData] = useState(client);
  const [mergeConfirmed, setMergeConfirmed] = useState(false);
  const duplicate = state.duplicate?.phone === normalizePhone(data.phone) ? state.duplicate : null;
  const change = (key: keyof ClientData, value: string) => { setData((current) => ({ ...current, [key]: value })); if (key === "phone") setMergeConfirmed(false); };
  return <form action={action} className="grid" data-confirm={mergeConfirmed && duplicate ? "Объединить карточки? Записи и ожидания перейдут в эту карточку, дубликат будет удалён." : undefined}>
    <input type="hidden" name="id" value={client.id} /><input type="hidden" name="redirectTo" value="profile" />
    <div className="grid-2"><label>Фамилия<input name="lastName" required value={data.lastName} onChange={(e) => change("lastName", e.target.value)} /></label><label>Имя<input name="firstName" required value={data.firstName} onChange={(e) => change("firstName", e.target.value)} /></label></div>
    <div className="grid-2"><label>Телефон<input name="phone" type="tel" required value={data.phone} onChange={(e) => change("phone", e.target.value)} /></label><label>Дата рождения<input name="birthDate" type="date" required value={data.birthDate} onChange={(e) => change("birthDate", e.target.value)} /></label></div>
    <label>Статус<select name="status" value={data.status} onChange={(e) => change("status", e.target.value)}>{CLIENT_STATUS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
    <label>Заметки<textarea name="notes" value={data.notes} onChange={(e) => change("notes", e.target.value)} /></label>
    {state.error ? <div className="notice danger-notice" role="alert">{state.error}</div> : null}
    {duplicate ? <div className="notice"><b>Найдена карточка: {duplicate.name}</b><p>{duplicate.phone}</p><a href={`/admin/my-clients/${duplicate.id}`} target="_blank" rel="noreferrer">Открыть и проверить карточку</a><label><input type="checkbox" name="mergeClientId" value={duplicate.id} checked={mergeConfirmed} onChange={(e) => setMergeConfirmed(e.target.checked)} /> Это один человек. Объединить записи и заметки в текущей карточке.</label></div> : null}
    <SubmitButton>{mergeConfirmed && duplicate ? "Объединить и сохранить" : "Сохранить профиль"}</SubmitButton>
  </form>;
}
