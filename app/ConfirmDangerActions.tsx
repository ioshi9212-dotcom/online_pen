"use client";

import { useEffect } from "react";

const words = ["удал", "архив", "отмен", "отклон", "заблок", "убрать"];

function norm(value: string) {
  return value.toLowerCase().replace(/ё/g, "е").trim();
}

function textFor(label: string) {
  const text = norm(label);
  if (text.includes("архив")) return "Отправить в архив? Данные останутся в базе, но пропадут из активного списка.";
  if (text.includes("удал")) return "Удалить? Действие применится сразу.";
  if (text.includes("отмен")) return "Отменить запись?";
  if (text.includes("отклон")) return "Отклонить заявку?";
  if (text.includes("заблок")) return "Заблокировать клиента?";
  if (text.includes("убрать")) return "Убрать из списка?";
  return "Вы уверены?";
}

function confirmText(element: HTMLElement | null, form?: HTMLFormElement | null) {
  const explicit = element?.getAttribute("data-confirm") || form?.getAttribute("data-confirm");
  if (explicit) return explicit;
  const label = norm(element?.textContent || "");
  const byClass = Boolean(element?.classList.contains("danger") || form?.classList.contains("danger"));
  const byText = words.some((word) => label.includes(word));
  if (!byClass && !byText) return "";
  return textFor(label);
}

export default function ConfirmDangerActions() {
  useEffect(() => {
    function onSubmit(event: Event) {
      const submitEvent = event as SubmitEvent;
      const form = event.target instanceof HTMLFormElement ? event.target : null;
      const submitter = submitEvent.submitter instanceof HTMLElement ? submitEvent.submitter : null;
      const message = confirmText(submitter, form);
      if (message && !window.confirm(message)) event.preventDefault();
    }
    function onClick(event: MouseEvent) {
      const link = event.target instanceof HTMLElement ? event.target.closest("a") : null;
      if (!(link instanceof HTMLElement)) return;
      const message = confirmText(link, null);
      if (message && !window.confirm(message)) event.preventDefault();
    }
    document.addEventListener("submit", onSubmit, true);
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("submit", onSubmit, true);
      document.removeEventListener("click", onClick, true);
    };
  }, []);
  return null;
}
