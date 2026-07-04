"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const ACTION_WORDS = ["запис", "отправ", "сохран", "войти", "провер", "отмен", "лист ожид", "ждать", "помню"];

type ToastState = {
  text: string;
  tone: "sending" | "done";
};

function successText(pathname: string, searchParams: URLSearchParams) {
  if (pathname.startsWith("/admin")) return "";
  if (searchParams.has("created")) return "Заявка отправлена";
  if (searchParams.get("waitlist") === "cancelled") return "Отменено";
  if (searchParams.has("waitlist")) return "Сохранено";
  if (searchParams.has("cancelled")) return "Запись отменена";
  if (searchParams.has("profileSaved") || searchParams.has("saved")) return "Сохранено";
  if (searchParams.has("remembered")) return "Сохранено";
  if (searchParams.has("login") || searchParams.has("known")) return "Готово";
  if (pathname === "/pending" && searchParams.has("phone") && !searchParams.has("already")) return "Заявка отправлена";
  return "";
}

function formLooksLikeClientAction(form: HTMLFormElement) {
  const submitter = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const submitterText = submitter?.textContent?.toLowerCase() || "";
  const formText = form.textContent?.toLowerCase() || "";
  const action = form.getAttribute("action")?.toLowerCase() || "";
  const text = `${submitterText} ${formText} ${action}`;
  return ACTION_WORDS.some((word) => text.includes(word));
}

export default function ClientSaveToast() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [toast, setToast] = useState<ToastState | null>(null);
  const searchString = useMemo(() => searchParams.toString(), [searchParams]);

  useEffect(() => {
    if (pathname.startsWith("/admin")) return;
    const params = new URLSearchParams(searchString);
    const text = successText(pathname, params);
    if (!text) return;

    setToast({ text, tone: "done" });
    const timer = window.setTimeout(() => setToast(null), 1900);
    return () => window.clearTimeout(timer);
  }, [pathname, searchString]);

  useEffect(() => {
    function onSubmit(event: SubmitEvent) {
      if (window.location.pathname.startsWith("/admin")) return;
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (!formLooksLikeClientAction(form)) return;

      setToast({ text: "Отправляю…", tone: "sending" });
      window.setTimeout(() => {
        setToast((current) => current?.tone === "sending" ? null : current);
      }, 7000);
    }

    document.addEventListener("submit", onSubmit, true);
    return () => document.removeEventListener("submit", onSubmit, true);
  }, []);

  if (!toast) return null;

  return (
    <div className={`client-save-toast ${toast.tone === "done" ? "is-done" : "is-sending"}`} role="status" aria-live="polite">
      <style jsx>{`
        .client-save-toast {
          position: fixed;
          left: 50%;
          bottom: calc(24px + env(safe-area-inset-bottom));
          transform: translateX(-50%);
          z-index: 10000;
          width: min(88vw, 340px);
          padding: 13px 16px;
          border-radius: 18px;
          text-align: center;
          font-weight: 800;
          box-shadow: 0 18px 42px rgba(72, 45, 58, .24);
          animation: client-save-toast-in .16s ease-out;
        }
        .client-save-toast.is-sending {
          background: #fff8fc;
          border: 1px solid rgba(196, 93, 132, .22);
          color: #6b4354;
        }
        .client-save-toast.is-done {
          background: #f1fff4;
          border: 1px solid rgba(71, 141, 84, .24);
          color: #245c31;
        }
        @keyframes client-save-toast-in {
          from { opacity: 0; transform: translate(-50%, 10px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>
      {toast.text}
    </div>
  );
}
