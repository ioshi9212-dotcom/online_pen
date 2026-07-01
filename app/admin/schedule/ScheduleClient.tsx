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
type OnlineWindowGroup = { key: string; title: string; items: { id: string; time: string }[] };
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
  openOnlineGroups: OnlineWindowGroup[];
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

const monthLabels = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const weekDayLabels = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

function freeWindowLabel(item: TimeItem) {
  return item.endTime && item.endTime !== item.time ? `${item.time}–${item.endTime}` : item.time;
}

function titleFromDateKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  if (!year || !month || !day) return key;
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return `${monthLabels[month - 1] || ""} ${day} ${weekDayLabels[weekday] || ""}`.trim();
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

function sortByDate(groups: OnlineWindowGroup[]) {
  return [...groups].sort((a, b) => a.key.localeCompare(b.key));
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
  const [openGroups, setOpenGroups] = useState<OnlineWindowGroup[]>(props.openOnlineGroups);
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
    setOpenGroups(props.openOnlineGroups);
  }, [props.openOnlineGroups]);

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
    const requestedTimes = [...onlineTimes].sort();
    setOnlineSaveState("saving");
    setOnlineSaveText("");
    try {
      const response = await fetch("/admin/schedule/save-online", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: props.selectedDateKey, times: requestedTimes })
      });
      const data = await response.json().catch(() => null) as { saved?: number; skipped?: number; savedTimes?: string[] } | null;
      if (!response.ok) throw new Error("save-failed");

      const savedTimes = Array.isArray(data?.savedTimes) ? data.savedTimes.map(String).sort() : requestedTimes;
      setOnlineTimes(savedTimes);
      setOpenGroups((current) => {
        const rest = current.filter((group) => group.key !== props.selectedDateKey);
        if (savedTimes.length === 0) return sortByDate(rest);
        const selectedGroup: OnlineWindowGroup = {
          key: props.selectedDateKey,
          title: titleFromDateKey(props.selectedDateKey),
          items: savedTimes.map((time) => ({ id: `${props.selectedDateKey}-${time}`, time }))
        };
        return sortByDate([selectedGroup, ...rest]);
      });

      setOnlineSaveState("saved");
      setOnlineSaveText(`Сохранила онлайн-окна: ${data?.saved ?? savedTimes.length}${data?.skipped ? `. Пропущено занятых: ${data.skipped}` : ""}.`);
      router.refresh();
    } catch {
      setOnlineSaveState("error");
      setOnlineSaveText("Не сохранилось. Обнови страницу и попробуй ещё раз.");
    }
  }

  const freeTimes = useMemo(() => props.selectedTimes.filter((item) => !item.isBusy), [props.selectedTimes]);
  const visibleTopTimes = useMemo(() => freeTimes.filter((item) => !onlineTimes.includes(item.time)), [freeTimes, onlineTimes]);
  const visibleOpenGroups = useMemo(() => sortByDate(openGroups), [openGroups]);
  const openOnlineText = useMemo(() => visibleOpenGroups
    .filter((group) => group.items.length > 0)
    .map((group) => `${group.title} - ${group.items.map((item) => item.time).join(", ")}`)
    .join("\n"), [visibleOpenGroups]);

  async function copyOpenOnlineList() {
    if (!openOnlineText) return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(openOnlineText);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = openOnlineText;
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
        #calendar .paint-selected { outline: 3px solid rgba(196, 93, 132, .38) !important; transform: translateY(-1px); }
        #calendar .calendar-day.paint-selected.paint-off { background: linear-gradient(135deg, #fff1f5, #f3d4de) !important; color: #73334d !important; border-color: #cf7896 !important; }
        #calendar .calendar-day.paint-selected.paint-working { background: linear-gradient(135deg, #effaf0, #ffffff) !important; color: #285d36 !important; border-color: #8fcf9d !important; }
        #calendar .calendar-day.paint-selected.paint-special { background: linear-gradient(135deg, #f7efff, #fdeaf3) !important; color: #6f438b !important; border-color: #bf96dd !important; }
        #calendar .calendar-day.paint-selected .day-number,
        #calendar .calendar-day.paint-selected small { color: inherit !important; }
        .paint-save-box { border: 1px solid rgba(196, 93, 132, .18); background: rgba(255, 248, 251, .86); }
        .schedule-floating-toast { position: fixed; left: 50%; bottom: calc(88px + env(safe-area-inset-bottom)); transform: translateX(-50%); z-index: 9999; width: min(92vw, 420px); padding: 14px 16px; border-radius: 20px; box-shadow: 0 18px 42px rgba(80, 48, 64, .24); text-align: center; font-weight: 900; animation: schedule-toast-in .18s ease-out; }
        .schedule-floating-toast.ok-notice { background: #f1fff4; border: 1px solid rgba(71, 141, 84, .24); color: #245c31; }
        .schedule-floating-toast.danger-notice { background: #fff2f2; border: 1px solid rgba(187, 67, 67, .24); color: #8a2c2c; }
        @keyframes schedule-toast-in { from { opacity: 0; transform: translate(-50%, 10px); } to { opacity: 1; transform: translate(-50%, 0); } }

        .schedule-calendar-head { display: grid; gap: 12px; }
        .schedule-calendar-head h2 { margin: 0; }
        .schedule-calendar-head p { margin: 4px 0 0; }
        .calendar-month-switcher { display: grid; grid-template-columns: 40px minmax(0, 1fr) 40px; align-items: center; gap: 8px; width: 100%; max-width: 360px; margin: 4px auto 0; }
        .calendar-month-title { text-align: center; font-weight: 800; font-size: 16px; }
        .calendar-arrow-button { min-height: 38px; padding: 0 !important; border-radius: 12px !important; display: inline-flex; align-items: center; justify-content: center; font-size: 18px; text-decoration: none; }
        .schedule-paint-actions { display: grid; grid-template-columns: auto repeat(3, minmax(0, 1fr)) auto; align-items: center; gap: 8px; }
        .schedule-paint-actions button { min-height: 38px !important; padding: 8px 10px !important; border-radius: 13px !important; white-space: nowrap; font-size: 13px; width: 100% !important; }
        .schedule-paint-label { font-size: 13px; color: #6f5b64; }
        #calendar .paint-mode-btn.paint-mode-off { background: #fff1f5 !important; color: #933f61 !important; border-color: #e6b7c7 !important; box-shadow: none !important; }
        #calendar .paint-mode-btn.paint-mode-working { background: #effaf0 !important; color: #2d7541 !important; border-color: #a9dcb4 !important; box-shadow: none !important; }
        #calendar .paint-mode-btn.paint-mode-special { background: #f7efff !important; color: #74499a !important; border-color: #cdb2ea !important; box-shadow: none !important; }
        #calendar .paint-mode-btn.paint-active { outline: 3px solid rgba(196, 93, 132, .22) !important; transform: translateY(-1px); }
        #calendar .paint-mode-btn.paint-mode-off.paint-active { background: linear-gradient(135deg, #bd5f82, #df93ad) !important; color: #fff !important; border-color: #bd5f82 !important; }
        #calendar .paint-mode-btn.paint-mode-working.paint-active { background: linear-gradient(135deg, #5ba46e, #8ecf9d) !important; color: #fff !important; border-color: #5ba46e !important; }
        #calendar .paint-mode-btn.paint-mode-special.paint-active { background: linear-gradient(135deg, #8d62b5, #cf92d6) !important; color: #fff !important; border-color: #8d62b5 !important; }

        #calendar .calendar-grid { display: grid !important; grid-template-columns: repeat(7, minmax(0, 1fr)) !important; gap: 6px !important; width: 100%; }
        #calendar .calendar-empty { min-height: 74px; }
        #calendar .calendar-day { width: 100% !important; min-width: 0 !important; min-height: 74px !important; aspect-ratio: 1 / .92; border-radius: 12px !important; padding: 8px !important; display: grid !important; align-content: start; gap: 2px; }
        #calendar .calendar-day .day-number { font-size: 16px; line-height: 1; font-weight: 800; }
        #calendar .calendar-day span:not(.day-number) { font-size: 11px; }
        #calendar .calendar-day small { font-size: 9.5px; line-height: 1.15; }
        #calendar .calendar-day.day-off { background: #f5eef2 !important; border-color: #ead5de !important; }
        #calendar .calendar-day.day-working { background: #f4fff5 !important; border-color: #d5ebd9 !important; }
        #calendar .calendar-day.day-special { background: #f7efff !important; border-color: #dac4ef !important; }

        .schedule-selected-card { padding: 16px !important; }
        .selected-date-title { margin: 0 0 12px; font-size: 18px; line-height: 1.2; font-weight: 600; }
        .schedule-day-grid { align-items: start; gap: 18px; }
        .time-control-panel, .open-online-card { background: transparent !important; border: 0 !important; box-shadow: none !important; padding: 0 !important; }
        .schedule-section-title { margin: 0 0 10px; font-size: 15px; line-height: 1.2; font-weight: 600; }
        .schedule-section-note { margin: -4px 0 10px; font-size: 12px; color: #74616b; }
        #selected-day .time-column-list { display: grid !important; grid-template-columns: repeat(5, minmax(0, 1fr)); grid-template-rows: repeat(6, minmax(36px, auto)); grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 8px; overflow: visible; padding: 2px 0 8px; max-height: none !important; }
        #selected-day .time-column-list .schedule-time-button { width: 100% !important; min-width: 0 !important; min-height: 36px !important; padding: 7px 6px !important; border-radius: 12px !important; font-size: 13px !important; font-weight: 700 !important; display: inline-flex !important; align-items: center !important; justify-content: center !important; box-shadow: none !important; }
        #selected-day .time-column-list .notice { grid-column: 1 / -1; }
        .chosen-time-list { display: flex; flex-wrap: wrap; gap: 8px; max-height: none !important; }
        .chosen-time-list button { min-height: 34px; padding: 7px 10px; border-radius: 12px; font-size: 13px; font-weight: 700; }
        .save-online-button { margin-top: 12px; width: 100%; min-height: 40px; border-radius: 14px; }
        .open-online-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
        .open-online-head h3 { margin: 0; font-size: 15px; line-height: 1.2; font-weight: 600; }
        .open-online-copy { white-space: nowrap; min-height: 34px; padding: 7px 10px; border-radius: 12px; font-size: 13px; }
        .open-online-plain-list { display: grid; gap: 0; }
        .open-online-plain-line { padding: 8px 0; border-bottom: 1px solid rgba(80, 58, 68, .14); font-size: 13px; line-height: 1.35; font-weight: 400; }
        .open-online-plain-line:last-child { border-bottom: 0; }
        .open-online-empty { padding: 8px 0; color: #76636d; font-size: 13px; }
        @media (max-width: 760px) {
          .schedule-top-card { position: static !important; top: auto !important; z-index: auto !important; }
          .calendar-month-switcher { max-width: 100%; }
          .schedule-selected-card { padding: 14px !important; }
          .schedule-day-grid { grid-template-columns: 1fr !important; gap: 18px; }
          .schedule-paint-actions { grid-template-columns: 1fr 1fr 1fr; }
          .schedule-paint-label { grid-column: 1 / -1; }
          .schedule-paint-actions button { font-size: 12.5px !important; padding-inline: 6px !important; }
          .schedule-paint-actions .paint-cancel-btn { grid-column: 1 / -1; }
          #calendar .calendar-grid { grid-template-columns: repeat(7, minmax(0, 1fr)) !important; gap: 6px !important; }
          #calendar .calendar-empty,
          #calendar .calendar-day { min-height: 52px !important; padding: 6px 4px !important; align-items: center !important; justify-content: center !important; text-align: center !important; gap: 2px !important; }
          #selected-day .time-column-list { grid-template-columns: repeat(5, minmax(0, 1fr)); grid-template-rows: repeat(6, minmax(34px, auto)); gap: 7px; }
          #selected-day .time-column-list .schedule-time-button { min-height: 34px !important; font-size: 12.5px !important; padding-inline: 4px !important; }
        }
      `}</style>

      {paintSaveText ? <div className={`schedule-floating-toast ${paintSaveState === "error" ? "danger-notice" : "ok-notice"}`} role="status" aria-live="polite">{paintSaveText}</div> : null}

      <section className="card schedule-calendar-card" id="calendar">
        <div className="schedule-calendar-head">
          <div>
            <h2>Календарь</h2>
            <p>Нажми дату, чтобы открыть окна для записи. Кнопки ниже — для быстрой отметки дней.</p>
          </div>
          <div className="calendar-month-switcher" aria-label="Переключение месяца">
            <a className="button secondary calendar-arrow-button" href={`/admin/schedule?view=calendar&month=${props.prevKey}#calendar`} aria-label="Предыдущий месяц">‹</a>
            <span className="calendar-month-title">{props.monthTitle}</span>
            <a className="button secondary calendar-arrow-button" href={`/admin/schedule?view=calendar&month=${props.nextKey}#calendar`} aria-label="Следующий месяц">›</a>
          </div>
        </div>

        <div className="schedule-paint-actions" style={{ marginTop: 14 }}>
          <span className="schedule-paint-label">Отметить:</span>
          {(["DAY_OFF", "WORKING", "SPECIAL"] as const).map((mode) => (
            <button
              type="button"
              key={mode}
              className={[
                "paint-mode-btn",
                mode === "DAY_OFF" ? "paint-mode-off" : mode === "WORKING" ? "paint-mode-working" : "paint-mode-special",
                paintMode === mode ? "paint-active" : "secondary"
              ].join(" ")}
              onClick={() => { setPaintMode((current) => current === mode ? "" : mode); setPaintDates([]); setPaintSaveText(""); }}
            >
              {modeLabels[mode]}
            </button>
          ))}
          {paintMode ? <button type="button" className="secondary paint-cancel-btn" onClick={() => { setPaintMode(""); setPaintDates([]); }}>Отмена</button> : null}
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
          <h2 className="selected-date-title">{props.selectedDateTitle}</h2>
          {props.warning ? <div className="notice danger-notice">Предупреждение: {props.warning}. Чтобы всё равно создать запись, поставь галочку подтверждения.</div> : null}
          {props.success ? <div className="notice ok-notice">{props.success}</div> : null}

          <div className="grid-2 schedule-day-grid">
            <div className="time-control-panel">
              <h3 className="schedule-section-title">Выбери время, чтобы открыть для записи</h3>
              <p className="schedule-section-note">Нажми время сверху — оно уйдёт в список открытых окон ниже.</p>

              <div className="time-list time-column-list">
                {visibleTopTimes.map((item) => <button type="button" className="schedule-time-button" key={item.time} onClick={() => addOnlineTime(item.time)} title="Свободно">{freeWindowLabel(item)}</button>)}
                {visibleTopTimes.length === 0 ? <div className="notice">Нет времени для выбора.</div> : null}
              </div>

              <h3 className="schedule-section-title" style={{ marginTop: 14 }}>Окна для клиентов онлайн</h3>
              <div className="time-list chosen-time-list">
                {onlineTimes.map((time) => <button type="button" className="ok schedule-time-button" key={time} onClick={() => removeOnlineTime(time)}>{time} ×</button>)}
                {onlineTimes.length === 0 ? <div className="notice">Пока не выбрано ни одного онлайн-окна.</div> : null}
              </div>

              {onlineSaveText ? <div className={`notice ${onlineSaveState === "error" ? "danger-notice" : "ok-notice"}`}>{onlineSaveText}</div> : null}
              <button className="save-online-button" type="button" onClick={saveOnlineTimes} disabled={onlineSaveState === "saving"}>{onlineSaveState === "saving" ? "Сохраняю…" : "Готово — сохранить онлайн-окна"}</button>
            </div>

            <div className="open-online-card">
              <div className="open-online-head">
                <h3>Открытые окна для записи</h3>
                <button type="button" className="secondary open-online-copy" onClick={copyOpenOnlineList} disabled={!openOnlineText}>
                  {copyState === "copied" ? "Скопировано" : "Скопировать"}
                </button>
              </div>

              <div className="open-online-plain-list" aria-label="Открытые окна для записи">
                {visibleOpenGroups.map((group) => (
                  <div key={group.key} className="open-online-plain-line">
                    {group.title} — {group.items.map((item) => item.time).join(", ")}
                  </div>
                ))}
                {visibleOpenGroups.length === 0 ? <div className="open-online-empty">Открытых окон пока нет.</div> : null}
              </div>

              {copyState === "error" ? <div className="notice danger-notice">Не получилось скопировать автоматически.</div> : null}
            </div>
          </div>
        </section>
      ) : <section className="card"><h2>Выбери день</h2><p>Нажми на дату в календаре, чтобы открыть список времени и выбор онлайн-окон.</p></section>}
    </div>
  );
}