import { Buffer } from "node:buffer";

const ALLOWED_AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_AVATAR_BYTES = 1_500_000;

export type AvatarUploadResult =
  | { ok: true; value: string }
  | { ok: false; error: "type" | "size" | "read" };

export function isUploadedAvatar(value: FormDataEntryValue | null): value is File {
  return typeof File !== "undefined" && value instanceof File && value.size > 0;
}

export async function avatarFileToDataUrl(file: File): Promise<AvatarUploadResult> {
  if (!ALLOWED_AVATAR_TYPES.has(file.type)) return { ok: false, error: "type" };
  if (file.size > MAX_AVATAR_BYTES) return { ok: false, error: "size" };

  try {
    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    return { ok: true, value: `data:${file.type};base64,${base64}` };
  } catch {
    return { ok: false, error: "read" };
  }
}
