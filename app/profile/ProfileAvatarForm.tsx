"use client";

import { FormEvent, useRef, useState } from "react";

type Props = {
  client: {
    firstName: string;
    lastName: string;
    phone: string;
    birthDate: string;
    avatarUrl: string;
  };
};

const MAX_SOURCE_AVATAR_BYTES = 8_000_000;
const MAX_SAVED_AVATAR_LENGTH = 650_000;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("image-load"));
    image.src = src;
  });
}

function canvasToDataUrl(canvas: HTMLCanvasElement) {
  const qualities = [0.82, 0.72, 0.62, 0.52];
  for (const quality of qualities) {
    const result = canvas.toDataURL("image/jpeg", quality);
    if (result.length <= MAX_SAVED_AVATAR_LENGTH) return result;
  }
  return canvas.toDataURL("image/jpeg", 0.45);
}

async function compressAvatar(file: File) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const maxSide = 520;
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    const ratio = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * ratio));
    const height = Math.max(1, Math.round(sourceHeight * ratio));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas-context");
    ctx.drawImage(image, 0, 0, width, height);
    return canvasToDataUrl(canvas);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export default function ProfileAvatarForm({ client }: Props) {
  const [preview, setPreview] = useState(client.avatarUrl);
  const [avatarDataUrl, setAvatarDataUrl] = useState("");
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function clearFileInput() {
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setError("");
    setSaved(false);
    setAvatarDataUrl("");
    setRemoveAvatar(false);

    if (!file) return;

    if (!ALLOWED_TYPES.has(file.type)) {
      setError("Можно загрузить только JPG, PNG или WEBP.");
      clearFileInput();
      return;
    }

    if (file.size > MAX_SOURCE_AVATAR_BYTES) {
      setError("Фото слишком большое. Выберите фото до 8 МБ, сайт сам его сожмёт.");
      clearFileInput();
      return;
    }

    setReading(true);
    try {
      const compressed = await compressAvatar(file);
      if (compressed.length > MAX_SAVED_AVATAR_LENGTH) {
        setError("Фото всё равно получилось слишком большим. Попробуйте другое или обрежьте его.");
        clearFileInput();
        return;
      }
      setPreview(compressed);
      setAvatarDataUrl(compressed);
    } catch {
      setError("Фото не удалось обработать. Попробуйте другое изображение.");
      clearFileInput();
    } finally {
      setReading(false);
    }
  }

  function handleRemoveAvatar(event: React.ChangeEvent<HTMLInputElement>) {
    const checked = event.target.checked;
    setRemoveAvatar(checked);
    setSaved(false);
    setError("");
    if (checked) {
      setPreview("");
      setAvatarDataUrl("");
      clearFileInput();
    } else {
      setPreview(client.avatarUrl);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reading || saving) return;

    const form = event.currentTarget;
    const formData = new FormData(form);

    setSaving(true);
    setSaved(false);
    setError("");

    try {
      const response = await fetch("/api/profile/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: String(formData.get("firstName") || ""),
          lastName: String(formData.get("lastName") || ""),
          phone: String(formData.get("phone") || ""),
          birthDate: String(formData.get("birthDate") || ""),
          avatarDataUrl,
          removeAvatar
        })
      });

      const result = await response.json().catch(() => ({ ok: false, error: "Сервер не ответил нормально." }));
      if (!response.ok || !result.ok) {
        setError(result.error || "Профиль не сохранился. Попробуйте ещё раз.");
        setSaving(false);
        return;
      }

      setSaved(true);
      window.location.assign(result.redirectTo || "/my?profileSaved=1#profile");
    } catch {
      setError("Не удалось сохранить профиль. Интернет или сайт опять решили устроить драму.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="client-v2-form profile-v2-form avatar-upload-form">
      <div className="profile-avatar-upload">
        <div className="avatar-preview profile-avatar-preview">
          {preview ? <img src={preview} alt="Фото клиента" /> : <span>{client.firstName.slice(0, 1).toUpperCase()}</span>}
        </div>
        <div>
          <label>Фото клиента
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleAvatarChange} />
          </label>
          <p>Фото поможет мастеру быстрее найти вашу карточку. Оно видно только в кабинете мастера.</p>
          {client.avatarUrl || preview ? <label className="avatar-remove-check"><input type="checkbox" checked={removeAvatar} onChange={handleRemoveAvatar} /> Убрать фото</label> : null}
          {reading ? <p className="client-v2-flash">Обрабатываем фото…</p> : null}
          {saved ? <p className="client-v2-flash is-success">Профиль сохранён.</p> : null}
          {error ? <p className="client-v2-flash is-error">{error}</p> : null}
        </div>
      </div>

      <div className="client-v2-form-grid">
        <label>Имя<input name="firstName" required defaultValue={client.firstName} /></label>
        <label>Фамилия<input name="lastName" required defaultValue={client.lastName} /></label>
      </div>
      <div className="client-v2-form-grid">
        <label>Телефон<input name="phone" required defaultValue={client.phone} /></label>
        <label>Дата рождения<input name="birthDate" type="date" required defaultValue={client.birthDate} /></label>
      </div>
      <div className="profile-v2-form-actions">
        <button type="submit" disabled={reading || saving}>{reading ? "Обрабатываю…" : saving ? "Сохраняю…" : "Сохранить"}</button>
        <a className="client-v2-button is-secondary" href="/my">Отмена</a>
      </div>
    </form>
  );
}
