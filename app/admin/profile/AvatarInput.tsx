"use client";

import { useState } from "react";

export default function AvatarInput({ photo }: { photo: string }) {
  const [preview, setPreview] = useState(photo);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function select(file?: File) {
    if (!file) return;
    setError(""); setValue("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8_000_000) { setError("Выберите JPG, PNG или WEBP до 8 МБ."); return; }
    const url = URL.createObjectURL(file);
    setLoading(true);
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = reject; img.src = url; });
      const ratio = Math.min(1, 520 / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas"); canvas.width = Math.round(img.naturalWidth * ratio); canvas.height = Math.round(img.naturalHeight * ratio);
      const context = canvas.getContext("2d"); if (!context) throw new Error("canvas");
      context.drawImage(img, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL("image/jpeg", 0.75);
      if (data.length > 650_000) throw new Error("size");
      setValue(data); setPreview(data);
    } catch { setError("Не удалось обработать фото. Выберите другое изображение."); }
    finally { setLoading(false); URL.revokeObjectURL(url); }
  }
  return <div className="grid"><div className="avatar-preview">{preview ? <img src={preview} alt="Фото мастера" /> : <span>М</span>}</div>
    <label>Фото мастера<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { void select(event.target.files?.[0]); }} /></label>
    <input type="hidden" name="masterAvatarDataUrl" value={value} />
    <label><input type="checkbox" name="removeAvatar" onChange={(event) => { if (event.target.checked) setPreview(""); else setPreview(value || photo); }} /> Убрать фото</label>
    {loading ? <p role="status">Обрабатываю фото…</p> : null}{error ? <p className="notice danger-notice" role="alert">{error}</p> : null}
  </div>;
}
