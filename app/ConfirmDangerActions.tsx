"use client";

import { useEffect } from "react";

const dangerWords = [
  "удал",
  "архив",
  "чёрн",
  "черн",
  "отмен",
  "отклон",
  "заблок",
  "убрать"
];

function normalize(text: string) {
  return text.toLowerCase().replace(/ё/g, "е").trim();
}

function messageFor(label: string) {
  const text = normalize(label);

  if (text.includes("архив")) return "Отправить в архив? Клиент пропадёт из активного списка, но данные останутся в базе.";
  if (text.includes("черн") || text.includes("заблок")) return "Добавить в чёрный список? Клиент потеряет доступ к онлайн-записи.";
  if (text.includes("удал")) return "Удалить? Это действие может убрать данные из списка.";
  if (text.includes("отмен")) return "Отменить запись? Окно снова станет доступным, если оно было занято.";
  if (text.includes("отклон")) return "Отклонить заявку? Клиент не получит доступ или запись не будет подтверждена.";
  if (text.includes("убрать")) return "Убрать из списка? Действие сразу применится.";

  return "Вы уверены? Действие применится сразу.";
}

function shouldConfirm(element: HTMLElement | null, form?: HTMLFormElement | null) {
  const explicit = element?.getAttribute("data-confirm") || form?.getAttribute("data-confirm");
  if (explicit) return explicit;

  const label = normalize(element?.textContent || "");
  const formLabel = normalize(form?.textContent || "");
  const hasDangerClass = Boolean(element?.classList.contains("danger") || form?.classList.contains("danger"));
  const hasDangerText = dangerWords.some((word) => label.includes(word)) || dangerWords.some((word) => formLabel.includes(word));

  if (!hasDangerClass && !hasDangerText) return "";
  return messageFor(label || formLabel);
}

export default function ConfirmDangerActions() {
  useEffect(() => {
    function onSubmit(event: Event) {
      const submitEvent = event as SubmitEvent;
      const form = event.target instanceof HTMLFormElement ? event.target : null;
      const submitter = submitEvent.submitter instanceof HTMLElement ? submitEvent.submitter : null;
      const message = shouldConfirm(submitter, form);

      if (!message) return;
      if (!window.confirm(message)) event.preventDefault();
    }

    function onClick(event: MouseEvent) {
      const target = event.target instanceof HTMLElement ? event.target.closest("a") : null;
      if (!(target instanceof HTMLElement)) return;
      const message = shouldConfirm(target, null);

      if (!message) return;
      if (!window.confirm(message)) event.preventDefault();
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
