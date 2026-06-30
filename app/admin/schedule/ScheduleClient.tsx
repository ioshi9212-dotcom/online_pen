"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { saveBulkDayOverridesInline } from "./actions";

type DayItem = {
  key: string;
  dayNumber: number;
  label: string;
  kind: string;
  isWorkingDay: boolean;
  bookingsCount: number;
  onlineCount: number;
};

type TimeItem = {
  time: string;
  busyLabel: string;
  isBusy: boolean;
  isOnline: boolean;
  kind: "free" | "booking" | "block";
  endTime?: string;
  booking?: {
    id: string;
    status: string;
    clientId: string;
    clientName: string;
    serviceId: string;
    serviceTitle: string;
    durationMinutes: number;
    finalPrice: number | null;
    clientComment: string;
    adminComment: string;
  };
};

type ClientItem = { id: string; name: string; phone: string };
type ServiceItem = { id: string; title: string; price: number; durationMinutes: number };
type PaintMode = "DAY_OFF" | "WORKING" | "SPECIAL";
type SaveState = "idle" | "saving" | "saved" | "error";

type Props = {
  monthKey: string;
  monthTitle: string;
  prevKey: string;
  nextKey: string;
  firstOffset: number;
  days: DayItem[];
  selectedDateKey: string;
  selectedDateTitle: string;
  selectedIsWorkingDay: boolean;
  selectedTimes: TimeItem[];
  currentOnlineTimes: string[];
  clients: ClientItem[];
  services: ServiceItem[];
  warning: string;
  success: string;
};

const modeLabels: Record<PaintMode, string> = {
  DAY_OFF: "Выходной",
  WORKING: "Рабочий",
  SPECIAL: "Особенный"
};

function freeWindowLabel(item: TimeItem) {
  return item.endTime && item.endTime !== item.time ? `${item.time}–${item.endTime}` : item.time;
}

function optimisticIsWorkingDay(kind: string, fallback: boolean) {
  if (kind === "DAY_OFF") return false;
  if (kind === "WORKING" || kind === "SPECIAL") return true;
  return fallback;
}

function optimisticDayLabel(kind: string, fallback: string) {
  if (kind === "DAY_OFF") return "выходной";
  if (kind === "WORKING") return "рабочий";
  if (kind === "SPECIAL") return "особенный";
  return fallback;
}

export default function ScheduleClient(props: Props) {
  const router = useRouter();
  const [isPaintPending, startPaintTransition] = useTransition();
  const [paintMode, setPaintMode] = useState<PaintMode | "">("");
  const [paintDates, setPaintDates] = useState<string[]>([]);
  const [paintSaveState, setPaintSaveState] = useState<SaveState>("idle");
  const [paintSaveText, setPaintSaveText] = useState("");
  const [optimisticDayKinds, setOptimisticDayKinds] = useState<Record<string, PaintMode>>({});
  const [onlineTimes, setOnlineTimes] = useState<string[]>(props.currentOnlineTimes);
  const [onlineSaveState, setOnlineSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [onlineSaveText, setOnlineSaveText] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  useEffect(() => {
    setOnlineTimes(props.currentOnlineTimes);
    setOnlineSaveState("idle");
    setOnlineSaveText("");
    setCopyState("idle");
  }, [props.selectedDateKey, props.currentOnlineTimes]);

  useEffect(() => {
    setOptimisticDayKinds({});
  }, [props.monthKey, props.days]);

  useEffect(() => {
    if (!paintSaveText) return;
    const timer = window.setTimeout(() => setPaintSaveText(""), paintSaveState === "error" ? 3600 : 2400);
    return () => window.clearTimeout(timer);
  }, [paintSaveState, paintSaveText]);

  function toggleDate(key: string) {
    if (!paintMode) {
      window.location.href = `/admin/schedule?view=calendar&month=${props.monthKey}&date=${key}#selected-day`;
      return;
    }

    setPaintDates((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }

  function addOnlineTime(time: string) {
    setOnlineTimes((current) => current.includes(time) ? current : [...current, time].sort());
  }

  function removeOnlineTime(time: string) {
    setOnlineTimes((current) => current.filter((item) => item !== time));
  }

  function savePaintDates() {
    if (!paintMode || paintDates.length === 0 || isPaintPending) return;

    const savedMode = paintMode;
    const savedDates = [...paintDates];
    const formData = new FormData();
    formData.set("month", props.monthKey);
    formData.set("kind", savedMode);
    formData.set("datesJson", JSON.stringify(savedDates));
    formData.set("startTime", "");
    formData.set("endTime", "");

    setPaintSaveState("saving");
    setPaintSaveText("");

    startPaintTransition(() => {
      void (async () => {
        try {
          const result = await saveBulkDayOverridesInline(formData);
          if (!result?.ok) throw new Error("save-failed");

          setOptimisticDayKinds((current) => {
            const next = { ...current };
            for (const key of savedDates) next[key] = savedMode;
            return next;
          });
          setPaintMode("");
          setPaintDates([]);
          setPaintSaveState("saved");
          setPaintSaveText(result.message || "Сохранено");
          router.refresh();
        } catch {
          setPaintSaveState("error");
          setPaintSaveText("Не сохранилось. Обнови страницу и попробуй ещё раз.");
        }
      })();
    });
  }

  async function saveOnlineTimes() {
    setOnlineSaveState("saving");
    setOnlineSaveText("");
    try {
      const response = await fetch("/admin/schedule/save-online", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: props.selectedDateKey, times: onlineTimes })
      });
      const data = await response.json().catch(() => null) as { saved?: number; skipped?: number } | null;
      if (!response.ok) throw new Error("save-failed");
      setOnlineSaveState("saved");
      setOnlineSaveText(`Сохранила онлайн-окна: ${data?.saved ?? onlineTimes.length}${data?.skipped ? `. Пропущено занятых: ${data.skipped}` : ""}.`);
    } catch {
      setOnlineSaveState("error");
      setOnlineSaveText("Не сохранилось. Обнови страницу и попробуй ещё раз.");
    }
  }

  const freeTimes = useMemo(() => props.selectedTimes.filter((item) => !item.isBusy), [props.selectedTimes]);
  const visibleTopTimes = useMemo(() => freeTimes.filter((item) => !onlineTimes.includes(item.time)), [freeTimes, onlineTimes]);
  const freePlacesText = useMemo(() => {
    if (freeTimes.length === 0) return `Свободных мест на ${props.selectedDateTitle} нет.`;
    return [`Свободные места на ${props.selectedDateTitle}:`, ...freeTimes.map((item) => `• ${freeWindowLabel(item)}`)].join("\n");
  }, [freeTimes, props.selectedDateTitle]);

  async function copyFreePlaces() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(freePlacesText);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = freePlacesText;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const copied = document.execCommand("copy");
        document.body.removeChild(textarea);
        if (!copied) throw new Error("copy-failed");
      }
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1800);
    } catch {
      setCopyState("error");
    }
  }

  return (
    <div className="grid schedule-calendar-workspace">
      <style jsx global>{`
        .paint-selected { outline: 4px solid rgba(196, 93, 132, .45) !important; transform: translateY(-2px); }
        .paint-off { background: linear-gradient(135deg, #bd5f82, #f2c7d7) !important; color: white !important; border-color: #a94e71 !important; }
        .paint-off .day-number, .paint-off small { color: white !important; }
        .paint-working { background: linear-gradient(135deg, #e5f3df, #ffffff) !important; border-color: #94bd8c !important; }
        .paint-special { background: linear-gradient(135deg, #f6bdd5, #f6e3ff) !important; border-color: #cf78a4 !important; }
        .paint-save-box { border: 1px solid rgba(196, 93, 132, .24); background: rgba(255, 248, 251, .96); }
        .schedule-floating-toast { position: fixed; left: 50%; bottom: calc(88px + env(safe-area-inset-bottom)); transform: translateX(-50%); z-index: 9999; width: min(92vw, 420px); padding: 14px 16px; border-radius: 20px; box-shadow: 0 18px 42px rgba(80, 48, 64, .24); text-align: center; font-weight: 900; animation: schedule-toast-in .18s ease-out; }
        .schedule-floating-toast.ok-notice { background: #f1fff4; border: 1px solid rgba(71, 141, 84, .24); color: #245c31; }
        .schedule-floating-toast.danger-notice { background: #fff2f2; border: 1px solid rgba(187, 67, 67, .24); color: #8a2c2c; }
        @keyframes schedule-toast-in { from { opacity: 0; transform: translate(-50%, 10px); } to { opacity: 1; transform: translate(-50%, 0); } }
        .free-places-card { align-content: start; }
        .free-places-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
        .free-places-head h3 { margin: 0 0 6px; }
        .free-places-copy { white-space: nowrap; }
        .free-places-list { grid-template-columns: repeat(auto-fit, minmax(74px, 1fr)); }
        .free-place-chip { min-height: 38px; display: grid; place-items: center; font-weight: 800; }
        .free-places-text { width: 100%; min-height: 126px; resize: vertical; margin-top: 12px; font-size: 13px; line-height: 1.45; }
        @media (max-width: 760px) {
          .schedule-top-card { position: static !important; top: auto !important; z-index: auto !important; }
          .free-places-head { display: grid; grid-template-columns: 1fr; }
          .free-places-copy { width: 100%; }
        }
      `}</style>

      {paintSaveText ? <div className={`schedule-floating-toast ${paintSaveState === "error" ? "danger-notice" : "ok-notice"}`} role="status" aria-live="polite">{paintSaveText}</div> : null}

      <section className="card schedule-calendar-card" id="calendar">
        <div className="actions" style={{ justifyContent: "space-between" }}>
          <div>
            <h2>Календарь</h2>
            <p>Обычный режим: нажми дату и ниже управляй записью. Кнопки ниже нужны только чтобы быстро отметить выходные или рабочие дни.</p>
          </div>
          <div className="actions">
            <a className="button secondary" href={`/admin/schedule?view=calendar&month=${props.prevKey}#calendar`}>← Пред. месяц</a>
            <span className="pill">{props.monthTitle}</span>
            <a className="button secondary" href={`/admin/schedule?view=calendar&month=${props.nextKey}#calendar`}>След. месяц →</a>
          </div>
        </div>

        <div className="actions schedule-paint-actions" style={{ marginTop: 14 }}>
          <span className="schedule-paint-label">Отметить дни:</span>
          {(["DAY_OFF", "WORKING", "SPECIAL"] as const).map((mode) => (
            <button type="button" key={mode} className={paintMode === mode ? "" : "secondary"} onClick={() => { setPaintMode((current) => current === mode ? "" : mode); setPaintDates([]); setPaintSaveText(""); }}>
              {modeLabels[mode]}
            </button>
          ))}
          {paintMode ? <button type="button" className="secondary" onClick={() => { setPaintMode(""); setPaintDates([]); }}>Отмена</button> : null}
        </div>

        {paintMode ? (
          <div className="notice paint-save-box" style={{ marginTop: 12 }}>
            <b>Режим: {modeLabels[paintMode]}</b>
            <p style={{ margin: "6px 0 12px" }}>Выбрано дат: {paintDates.length}. Нажми “Готово”, чтобы сохранить эти дни.</p>
            <button type="button" onClick={savePaintDates} disabled={paintDates.length === 0 || isPaintPending || paintSaveState === "saving"}>
              {isPaintPending || paintSaveState === "saving" ? "Сохраняю…" : "Готово — сохранить даты"}
            </button>
          </div>
        ) : null}

        <div className="calendar-grid calendar-head">
          {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((day) => <b key={day}>{day}</b>)}
        </div>

        <div className="calendar-grid">
          {Array.from({ length: props.firstOffset }).map((_, index) => <div className="calendar-empty" key={`empty-${index}`} />)}
          {props.days.map((day) => {
            const selectedForPaint = paintDates.includes(day.key);
            const selectedDate = props.selectedDateKey === day.key;
            const effectiveKind = optimisticDayKinds[day.key] || day.kind;
            const effectiveIsWorkingDay = optimisticIsWorkingDay(effectiveKind, day.isWorkingDay);
            const label = optimisticDayLabel(effectiveKind, day.label);
            const classes = ["calendar-day", effectiveIsWorkingDay ? "day-working" : "day-off", effectiveKind === "SPECIAL" ? "day-special" : "", selectedDate ? "selected" : "", selectedForPaint ? "paint-selected" : "", selectedForPaint && paintMode === "DAY_OFF" ? "paint-off" : "", selectedForPaint && paintMode === "WORKING" ? "paint-working" : "", selectedForPaint && paintMode === "SPECIAL" ? "paint-special" : ""].join(" ");

            return (
              <button type="button" className={classes} key={day.key} onClick={() => toggleDate(day.key)} style={{ textAlign: "left", cursor: "pointer" }}>
                <span className="day-number">{day.dayNumber}</span>
                <span>{label}</span>
                <small>{day.bookingsCount ? `${day.bookingsCount} запис.` : "нет записей"}</small>
                <small>{day.onlineCount ? `${day.onlineCount} онлайн-окон` : "онлайн-окон нет"}</small>
              </button>
            );
          })}
        </div>
      </section>

      {props.selectedDateKey ? (
        <section className="card schedule-selected-card" id="selected-day">
          <h2>{props.selectedDateTitle}</h2>
          {props.warning ? <div className="notice danger-notice">Предупреждение: {props.warning}. Чтобы всё равно создать запись, поставь галочку подтверждения.</div> : null}
          {props.success ? <div className="notice ok-notice">{props.success}</div> : null}

          <div className="grid-2 schedule-day-grid">
            <div className="mini-card">
              <h3>Открыть окна для онлайн-записи</h3>
              <p className="small">Нажимай свободное время сверху — оно исчезнет из списка и уйдёт вниз. Нижний список — то, что увидят клиенты онлайн.</p>

              <div className="grid">
                <b>Свободное время дня</b>
                <div className="time-list" style={{ maxHeight: 360 }}>
                  {visibleTopTimes.map((item) => <button type="button" key={item.time} onClick={() => addOnlineTime(item.time)} title="Свободно">{item.time}</button>)}
                  {visibleTopTimes.length === 0 ? <div className="notice">Свободных времён для переноса вниз нет.</div> : null}
                </div>
              </div>

              <div className="grid" style={{ marginTop: 16 }}>
                <b>Окна для клиентов онлайн</b>
                <div className="time-list" style={{ maxHeight: 280 }}>
                  {onlineTimes.map((time) => <button type="button" className="ok" key={time} onClick={() => removeOnlineTime(time)}>{time} ×</button>)}
                  {onlineTimes.length === 0 ? <div className="notice">Пока не выбрано ни одного онлайн-окна.</div> : null}
                </div>

                {onlineSaveText ? <div className={`notice ${onlineSaveState === "error" ? "danger-notice" : "ok-notice"}`}>{onlineSaveText}</div> : null}
                <button type="button" onClick={saveOnlineTimes} disabled={onlineSaveState === "saving"}>{onlineSaveState === "saving" ? "Сохраняю…" : "Готово — сохранить онлайн-окна"}</button>
              </div>
            </div>

            <div className="mini-card free-places-card">
              <div className="free-places-head">
                <div>
                  <h3>Свободные места</h3>
                  <p className="small">Готовый текст со свободными окнами на выбранный день.</p>
                </div>
                <button type="button" className="secondary free-places-copy" onClick={copyFreePlaces}>
                  {copyState === "copied" ? "Скопировано" : "Скопировать"}
                </button>
              </div>

              <div className="time-list free-places-list" style={{ marginTop: 12 }}>
                {freeTimes.map((item) => <span key={item.time} className="slot free-place-chip">{freeWindowLabel(item)}</span>)}
                {freeTimes.length === 0 ? <div className="notice danger-notice">Свободных мест на этот день нет.</div> : null}
              </div>

              <textarea className="free-places-text" readOnly value={freePlacesText} aria-label="Текст свободных мест для копирования" />
              {copyState === "error" ? <div className="notice danger-notice">Не получилось скопировать автоматически. Можно выделить текст в поле и скопировать вручную.</div> : null}
            </div>
          </div>
        </section>
      ) : <section className="card"><h2>Выбери день</h2><p>Нажми на дату в календаре, чтобы открыть список времени и выбор онлайн-окон.</p></section>}
    </div>
  );
}
