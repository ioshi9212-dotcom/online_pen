import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function sessionSecret(kind: "admin" | "client") {
  const value = (kind === "client" ? process.env.CLIENT_SESSION_SECRET : "") || process.env.ADMIN_SECRET;
  if ((!value || value.length < 32) && process.env.NODE_ENV === "production") throw new Error("Session secret must contain at least 32 characters in production");
  return value || "development-only-session-secret";
}

export function signSession(subject: string, kind: "admin" | "client", ttlSeconds: number, now = Date.now()) {
  const payload = `v1.${Math.floor(now / 1000) + ttlSeconds}.${subject}.${randomBytes(16).toString("hex")}`;
  return `${payload}.${createHmac("sha256", sessionSecret(kind)).update(`${kind}:${payload}`).digest("hex")}`;
}

export function readSession(value: string | undefined, kind: "admin" | "client", now = Date.now()) {
  if (!value || value.length > 500) return "";
  const parts = value.split(".");
  if (parts.length !== 5 || parts[0] !== "v1" || !/^\d+$/.test(parts[1]) || !/^[a-zA-Z0-9_-]+$/.test(parts[2]) || !/^[a-f0-9]{32}$/.test(parts[3]) || !/^[a-f0-9]{64}$/.test(parts[4])) return "";
  const expires = Number(parts[1]);
  if (!Number.isSafeInteger(expires) || expires <= now / 1000) return "";
  const expected = createHmac("sha256", sessionSecret(kind)).update(`${kind}:${parts.slice(0, 4).join(".")}`).digest();
  const signature = Buffer.from(parts[4], "hex");
  return signature.length === expected.length && timingSafeEqual(signature, expected) ? parts[2] : "";
}
