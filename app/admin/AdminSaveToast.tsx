"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const SUCCESS_KEYS = ["done", "success", "saved", "updated", "created", "toggled", "booking", "moved", "archived"];
const SAVE_WORDS = ["сохран", "готово", "добав", "измен", "редакт", "принять", "подтверд", "создать"];

type ToastState = {
  text: string;
  tone: "saving" | "saved";
};

function hasSuccessSignal(searchParams: URLSearchParams) {
  return SUCCESS_KEYS.some((key) => searchParams.has(key));
}

function submitLooksLikeSave(form: HTMLFormElement) {
  const submitter = (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const submitterText = submitter?.textContent?.toLowerCase() || "";
  const formText = form.textContent?.toLowerCase() || "";
  const text = `${submitterText} ${formText}`;
  return SAVE_WORDS.some((word) => text.includes(word));
}

export default function AdminSaveToast() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [toast, setToast] = useState<ToastState | null>(null);

  const searchString = useMemo(() => searchParams.toString(), [searchParams]);

  useEffect(() => {
    if (pathname === "/admin/login" || pathname.startsWith("/admin/logout")) return;
    const params = new URLSearchParams(searchString);
    if (!hasSuccessSignal(params)) return;

    setToast({ text: "Сохранено", tone: "saved" });
    const timer = window.setTimeout(() => setToast(null), 1800);
    return () => window.clearTimeout(timer);
  }, [pathname, searchString]);

  useEffect(() => {
    function onSubmit(event: SubmitEvent) {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (!submitLooksLikeSave(form)) return;

      setToast({ text: "Сохраняю…", tone: "saving" });
      window.setTimeout(() => {
        setToast((current) => current?.tone === "saving" ? null : current);
      }, 7000);
    }

    document.addEventListener("submit", onSubmit, true);
    return () => document.removeEventListener("submit", onSubmit, true);
  }, []);

  if (!toast) return null;

  return (
    <div className={`admin-save-toast ${toast.tone === "saved" ? "is-saved" : "is-saving"}`} role="status" aria-live="polite">
      <style jsx>{`
        .admin-save-toast {
          position: fixed;
          left: 50%;
          bottom: calc(86px + env(safe-area-inset-bottom));
          transform: translateX(-50%);
          z-index: 10000;
          width: min(88vw, 340px);
          padding: 13px 16px;
          border-radius: 18px;
          text-align: center;
          font-weight: 800;
          box-shadow: 0 18px 42px rgba(72, 45, 58, .24);
          animation: save-toast-in .16s ease-out;
        }
        .admin-save-toast.is-saving {
          background: #fff8fc;
          border: 1px solid rgba(196, 93, 132, .22);
          color: #6b4354;
        }
        .admin-save-toast.is-saved {
          background: #f1fff4;
          border: 1px solid rgba(71, 141, 84, .24);
          color: #245c31;
        }
        @keyframes save-toast-in {
          from { opacity: 0; transform: translate(-50%, 10px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>
      {toast.text}
    </div>
  );
}
