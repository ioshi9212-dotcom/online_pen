"use client";

import { useEffect, useState } from "react";

type Props = { role: "admin" | "client" };
type Status = "loading" | "unconfigured" | "unsupported" | "off" | "on" | "busy";
function bytesFromBase64Url(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export default function PushNotifications({role}: Props) {
  const [status, setStatus] = useState<Status>("loading");
  const [publicKey, setPublicKey] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await fetch("/api/push/config", {cache:"no-store"});
        const config = await response.json();
        if (!active) return;
        if (!config.enabled || !config.publicKey) { setStatus("unconfigured"); return; }
        setPublicKey(config.publicKey);
        if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
          setStatus("unsupported"); return;
        }
        const registration = await navigator.serviceWorker.getRegistration("/");
        const current = await registration?.pushManager.getSubscription();
        if (current && Notification.permission === "granted") {
          const save = await fetch("/api/push/subscription",{
            method:"POST",headers:{"Content-Type":"application/json"},
            body:JSON.stringify({role,subscription:current.toJSON()})
          });
          if (active) setStatus(save.ok ? "on" : "off");
        } else if (active) setStatus("off");
      } catch { if (active) setStatus("unconfigured"); }
    })();
    return () => { active = false; };
  }, [role]);

  async function enable() {
    setMessage("");
    // On iOS the OS permission prompt must be triggered directly by this tap.
    const permission = Notification.permission === "default"
      ? await Notification.requestPermission()
      : Notification.permission;
    if (permission !== "granted") { setMessage("Уведомления запрещены в настройках телефона."); return; }
    setStatus("busy");
    try {
      const registration = await navigator.serviceWorker.register("/sw.js", {scope:"/"});
      const subscription = await registration.pushManager.getSubscription() ||
        await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytesFromBase64Url(publicKey).buffer as ArrayBuffer});
      const response = await fetch("/api/push/subscription", {
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({role,subscription:subscription.toJSON()})
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Не удалось подключить устройство");
      setStatus("on");
      setMessage("Уведомления включены для этого устройства.");
    } catch (error) {
      setStatus("off");
      setMessage(error instanceof Error ? error.message : "Не удалось включить уведомления.");
    }
  }

  async function disable() {
    setStatus("busy"); setMessage("");
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        const response = await fetch("/api/push/subscription", {
          method:"DELETE",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({role,endpoint:subscription.endpoint})
        });
        if (!response.ok) throw new Error("Не удалось удалить подписку с сервера");
        await subscription.unsubscribe();
      }
      setStatus("off");
      setMessage("Уведомления отключены на этом устройстве.");
    } catch (error) {
      setStatus("on");
      setMessage(error instanceof Error ? error.message : "Не удалось отключить уведомления.");
    }
  }

  async function sendTest() {
    setMessage("");
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (!subscription) {setStatus("off"); return;}
      const response=await fetch("/api/push/test", {
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({role,endpoint:subscription.endpoint})
      });
      const result=await response.json();
      setMessage(response.ok ? "Тест отправлен. Проверьте уведомления телефона." : (result.error || "Не удалось отправить тест."));
    } catch {setMessage("Не удалось отправить тест.");}
  }

  return <section className="card push-settings" aria-label="Push-уведомления">
    <h2>Уведомления на телефон</h2>
    <p className="muted">Включаются отдельно на каждом устройстве. На iPhone откройте Online Pen с иконки на экране «Домой».</p>
    {status === "unconfigured" ? <p className="muted">Пока не включены на сервере. Мастеру нужно настроить ключи Web Push в Amvera.</p> : null}
    {status === "unsupported" ? <p className="muted">Этот режим браузера не поддерживает push. На iPhone добавьте сайт на экран «Домой» и откройте оттуда.</p> : null}
    {status === "loading" ? <p className="muted">Проверяю доступность уведомлений…</p> : null}
    {status === "on" ? <p className="muted">На устройстве разрешены уведомления.</p> : null}
    <div className="actions">
      {status === "off" ? <button type="button" onClick={enable}>Включить уведомления</button> : null}
      {status === "on" ? <>
        <button type="button" onClick={sendTest}>Отправить тест</button>
        <button type="button" className="secondary" onClick={disable}>Отключить</button>
      </> : null}
      {status === "busy" ? <button type="button" disabled>Подключаю…</button> : null}
    </div>
    {message ? <p role="status" className="notice">{message}</p> : null}
    <p className="muted"><small>После выхода из аккаунта уведомления могут продолжить приходить. На чужом телефоне сначала нажмите «Отключить».</small></p>
  </section>;
}
