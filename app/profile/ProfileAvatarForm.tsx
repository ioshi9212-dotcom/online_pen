"use client";

import { useRef, useState } from "react";
import { updateClientProfile } from "@/app/actions";

type Props = {
  token: string;
  client: {
    firstName: string;
    lastName: string;
    phone: string;
    birthDate: string;
    avatarUrl: string;
  };
};

const MAX_AVATAR_BYTES = 1_500_000;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export default function ProfileAvatarForm({ token, client }: Props) {
  const [preview, setPreview] = useState(client.avatarUrl);
  const [avatarDataUrl, setAvatarDataUrl] = useState("");
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function clearFileInput() {
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setError("");
    setAvatarDataUrl("");
    setRemoveAvatar(false);

    if (!file) return;

    if (!ALLOWED_TYPES.has(file.type)) {
      setError("Можно загрузить только JPG, PNG или WEBP.");
      clearFileInput();
      return;
    }

    if (file.size > MAX_AVATAR_BYTES) {
      setError("Фото слишком большое. Нужно до 1,5 МБ.");
      clearFileInput();
      return;
    }

    setReading(true);
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result) {
        setError("Фото не удалось прочитать. Попробуйте другое.");
        setReading(false);
        return;
      }
      setPreview(result);
      setAvatarDataUrl(result);
      setReading(false);
    };
    reader.onerror = () => {
      setError("Фото не удалось прочитать. Попробуйте другое.");
      setReading(false);
    };
    reader.readAsDataURL(file);
  }

  function handleRemoveAvatar(event: React.ChangeEvent<HTMLInputElement>) {
    const checked = event.target.checked;
    setRemoveAvatar(checked);
    setError("");
    if (checked) {
      setPreview("");
      setAvatarDataUrl("");
      clearFileInput();
    } else {
      setPreview(client.avatarUrl);
    }
  }

  return (
    <form action={updateClientProfile} className="card grid avatar-upload-form">
      <input type="hidden" name="clientToken" value={token} />
      <input type="hidden" name="avatarDataUrl" value={avatarDataUrl} />
      {removeAvatar ? <input type="hidden" name="removeAvatar" value="on" /> : null}

      <div className="profile-avatar-upload">
        <div className="avatar-preview profile-avatar-preview">
          {preview ? <img src={preview} alt="Фото клиента" /> : <span>{client.firstName.slice(0, 1).toUpperCase()}</span>}
        </div>
        <div>
          <label>Фото клиента
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleAvatarChange} />
          </label>
          <p className="muted">Фото появится в кружке сразу после выбора. Ссылка не нужна. Лучше квадратное фото до 1,5 МБ.</p>
          {client.avatarUrl || preview ? <label className="avatar-remove-check"><input type="checkbox" checked={removeAvatar} onChange={handleRemoveAvatar} /> Убрать фото</label> : null}
          {reading ? <p className="notice">Читаю фото… секунду, сайт делает вид, что он взрослый.</p> : null}
          {error ? <p className="notice danger-notice">{error}</p> : null}
        </div>
      </div>

      <div className="grid-2">
        <label>Имя<input name="firstName" required defaultValue={client.firstName} /></label>
        <label>Фамилия<input name="lastName" required defaultValue={client.lastName} /></label>
      </div>
      <div className="grid-2">
        <label>Телефон<input name="phone" required defaultValue={client.phone} /></label>
        <label>Дата рождения<input name="birthDate" type="date" required defaultValue={client.birthDate} /></label>
      </div>
      <div className="actions">
        <button type="submit" disabled={reading}>{reading ? "Подождите…" : "Сохранить"}</button>
        <a className="button secondary" href={`/my?client=${token}`}>Назад</a>
      </div>
    </form>
  );
}
