const ALLOWED_AVATAR_DATA_URL = /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_AVATAR_DATA_URL_LENGTH = 2_100_000;

export type AvatarDataUrlResult =
  | { ok: true; value: string }
  | { ok: false; error: "type" | "size" };

export function normalizeAvatarDataUrl(value: FormDataEntryValue | null): AvatarDataUrlResult | null {
  const text = String(value || "").trim();
  if (!text) return null;
  if (text.length > MAX_AVATAR_DATA_URL_LENGTH) return { ok: false, error: "size" };
  if (!ALLOWED_AVATAR_DATA_URL.test(text)) return { ok: false, error: "type" };
  return { ok: true, value: text };
}
