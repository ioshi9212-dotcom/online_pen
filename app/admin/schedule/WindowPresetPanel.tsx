"use client";

import { useState } from "react";
import type { WindowPreset } from "@/lib/windowPresets";

type Draft = { name: string; timesText: string };
type Result = { ok?: boolean; error?: string; preset?: WindowPreset; added?: number; addedTimes?: string[]; alreadyOpen?: number; unavailable?: number };

const toDraft = (preset: WindowPreset): Draft => ({ name: preset.name, timesText: preset.times.join(", ") });
const same = (draft: Draft, saved: WindowPreset) =>
  draft.name.trim() === saved.name && draft.timesText.trim() === saved.times.join(", ");

type Props = {
  initialPresets: WindowPreset[];
  date: string;
  dayTitle: string;
  isWorkingDay: boolean;
  selectedTimes: string[];
  hasUnsavedCalendarChanges: boolean;
  onApplied: (times: string[]) => void;
};

export default function WindowPresetPanel({
  initialPresets, date, dayTitle, isWorkingDay, selectedTimes, hasUnsavedCalendarChanges, onApplied
}: Props) {
  const [saved, setSaved] = useState<WindowPreset[]>(initialPresets);
  const [drafts, setDrafts] = useState<Draft[]>(initialPresets.map(toDraft));
  const [busyIndex, setBusyIndex] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<Record<number, { text: string; isError: boolean }>>({});

  function edit(index: number, patch: Partial<Draft>) {
    setDrafts((current) => current.map((draft, i) => i === index ? { ...draft, ...patch } : draft));
    setFeedback((current) => ({ ...current, [index]: { text: "", isError: false } }));
  }

  function report(index: number, text: string, isError = false) {
    setFeedback((current) => ({ ...current, [index]: { text, isError } }));
  }

  async function send(input: Record<string, unknown>): Promise<Result> {
    const response = await fetch("/admin/schedule/presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(input)
    });
    const result: Result = await response.json().catch(() => null) || {};
    if (!response.ok || !result.ok) throw new Error(result.error || "Не получилось сохранить. Попробуйте ещё раз.");
    return result;
  }

  async function save(index: number) {
    if (busyIndex !== null) return;
    setBusyIndex(index); report(index, "");
    try {
      const result = await send({ action: "save", index, name: drafts[index].name, times: drafts[index].timesText });
      if (!result.preset) throw new Error("Шаблон не сохранился.");
      setSaved((current) => current.map((item, i) => i === index ? result.preset! : item));
      setDrafts((current) => current.map((item, i) => i === index ? toDraft(result.preset!) : item));
      report(index, "Сохранено. Этот набор останется доступен в другие дни.");
    } catch (error) {
      report(index, error instanceof Error ? error.message : "Не удалось сохранить шаблон.", true);
    } finally { setBusyIndex(null); }
  }

  async function apply(index: number) {
    if (busyIndex !== null) return;
    if (!same(drafts[index], saved[index])) {
      report(index, "Сначала нажмите «Сохранить шаблон», иначе отправятся прежние часы.", true);
      return;
    }
    if (hasUnsavedCalendarChanges) {
      report(index, "Сначала сохраните изменения часов или отметок дней в календаре.", true);
      return;
    }
    if (!isWorkingDay) {
      report(index, "Этот день отмечен выходным. Сначала сделайте его рабочим.", true);
      return;
    }
    if (!saved[index].times.length) {
      report(index, "Сначала укажите и сохраните часы для этого варианта.", true);
      return;
    }
    setBusyIndex(index); report(index, "");
    try {
      const result = await send({ action: "apply", index, date });
      onApplied(result.addedTimes || []);
      report(index, "Добавлено: " + (result.added ?? 0) +
        ". Уже было открыто: " + (result.alreadyOpen ?? 0) +
        ". Пропущено (занято, прошлое или вне рабочих часов): " + (result.unavailable ?? 0) + ".");
    } catch (error) {
      report(index, error instanceof Error ? error.message : "Не удалось добавить часы.", true);
    } finally { setBusyIndex(null); }
  }

  return (
    <details className="window-presets" aria-label="Шаблоны свободных окон">
      <summary>⏱ Готовые часы для записи · 3 шаблона</summary>
      <div className="window-presets-content">
        <p className="muted">Один раз сохрани привычные часы, потом выбирай день и нажимай «Добавить на этот день». Старые окна и записи не удаляются.</p>
        <p className="muted">Выбранный день: <b>{dayTitle}</b>{!isWorkingDay ? " · выходной" : ""}</p>
        <div className="window-presets-grid">
          {saved.map((item, index) => {
            const draft = drafts[index];
            const changed = !same(draft, item);
            const waiting = busyIndex !== null;
            return (
              <div className="window-preset-card" key={index}>
                <b className="window-preset-number">Вариант {index + 1}</b>
                <label>Название набора
                  <input maxLength={40} value={draft.name} onChange={(event) => edit(index, { name: event.target.value })} placeholder="Например: Короткий день" />
                </label>
                <label>Время через запятую
                  <textarea rows={2} value={draft.timesText} onChange={(event) => edit(index, { timesText: event.target.value })} placeholder="10:00, 12:00, 14:30, 17:00" />
                </label>
                <div className="window-preset-actions">
                  <button type="button" className="secondary" disabled={waiting || selectedTimes.length === 0}
                    onClick={() => edit(index, { timesText: [...new Set(selectedTimes)].sort().join(", ") })}>
                    Взять часы из выбранного дня
                  </button>
                  <button type="button" className="secondary" disabled={waiting} onClick={() => save(index)}>
                    {busyIndex === index ? "Секунду…" : "Сохранить шаблон"}
                  </button>
                  <button type="button" disabled={waiting || !item.times.length} onClick={() => apply(index)}>
                    {busyIndex === index ? "Добавляю…" : "Добавить на этот день"}
                  </button>
                </div>
                {changed ? <small className="muted">Есть изменения шаблона — сначала сохрани.</small> : null}
                {feedback[index]?.text ? <p className={feedback[index].isError ? "notice danger-notice" : "notice ok-notice"} role="status">{feedback[index].text}</p> : null}
              </div>
            );
          })}
        </div>
        <small className="muted">Открытые часы сохраняются сразу после «Добавить на этот день». Занятые окна, выходные и неподходящие рабочие часы пропускаются.</small>
      </div>
    </details>
  );
}
