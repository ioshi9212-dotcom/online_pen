"use client";

import { useEffect } from "react";

const dangerous = ["удал", "архив", "отмен", "отклон", "заблок", "убрать", "черн", "чёрн"];

function normalize(value: string) {
  return value.toLowerCase().replace(/ё/g, "е");
}

function message(label: string) {
  const text = normalize(label);
  if (text.includes("архив")) return "Отправить в архив?";
  if (text.includes("удал")) return "Удалить? Действие применится сразу.";
  if (text.includes("отмен")) return "Отменить запись?";
  if (text.includes("отклон")) return "Отклонить заявку?";
  if (text.includes("заблок") || text.includes("черн")) return "Заблокировать клиента?";
  if (text.includes("убрать")) return "Убрать из списка?";
  return "Вы уверены?";
}

export default function ConfirmDangerActions() {
  useEffect(() => {
    function shouldConfirm(el: HTMLElement | null, form?: HTMLFormElement | null) {
      const explicit = el?.getAttribute("data-confirm") || form?.getAttribute("data-confirm");
      if (explicit) return explicit;
      const text = normalize(el?.textContent || "");
      const byClass = Boolean(el?.classList.contains("danger") || form?.classList.contains("danger"));
      const byText = dangerous.some((word) => text.includes(word));
      return byClass || byText ? message(text) : "";
    }

    function onSubmit(event: Event) {
      const submitEvent = event as SubmitEvent;
      const form = event.target instanceof HTMLFormElement ? event.target : null;
      const submitter = submitEvent.submitter instanceof HTMLElement ? submitEvent.submitter : null;
      const text = shouldConfirm(submitter, form);
      if (text && !window.confirm(text)) event.preventDefault();
    }

    function onClick(event: MouseEvent) {
      const link = event.target instanceof HTMLElement ? event.target.closest("a") : null;
      if (!(link instanceof HTMLElement)) return;
      const text = shouldConfirm(link, null);
      if (text && !window.confirm(text)) event.preventDefault();
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
