import { createCipheriv, createECDH, createPrivateKey, hkdfSync, randomBytes, sign } from "node:crypto";

/**
 * Standard Web Push: RFC 8291 (aes128gcm) + RFC 8292 (VAPID ES256).
 * No dependency on an external notification gateway; browser vendor push
 * endpoints carry encrypted payloads to the subscribed device.
 */
export type BrowserPushSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export type PushMessage = { title: string; body: string; url: string; tag?: string };

const decode = (value: string) => Buffer.from(value, "base64url");
const encode = (value: Buffer | string) => Buffer.from(value).toString("base64url");

export function pushConfiguration() {
  const publicKey = process.env.WEB_PUSH_PUBLIC_KEY || "";
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY || "";
  const subject = process.env.WEB_PUSH_SUBJECT || "";
  if (!publicKey && !privateKey && !subject) return null;
  const pub = decode(publicKey), priv = decode(privateKey);
  if (pub.length !== 65 || pub[0] !== 4 || priv.length !== 32 ||
    !(/^(mailto:[^\s@]+@[^\s@]+\.[^\s@]+|https:\/\/[^\s]+)$/.test(subject))) {
    throw new Error("Invalid WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY or WEB_PUSH_SUBJECT");
  }
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(priv);
  if (!ecdh.getPublicKey().equals(pub)) throw new Error("VAPID public/private keys do not match");
  return { publicKey, privateKey, subject };
}

/**
 * Restrict endpoints: an authenticated subscriber cannot make our server
 * POST encrypted messages to arbitrary intranet or attacker URLs.
 */
export function safePushEndpoint(value: string) {
  if (value.length > 1000) return false;
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" || u.username || u.password || u.port || u.hash) return false;
    const host = u.hostname.toLowerCase();
    return host === "fcm.googleapis.com" ||
      host === "updates.push.services.mozilla.com" ||
      host === "android.googleapis.com" ||
      host.endsWith(".push.apple.com") ||
      host.endsWith(".notify.windows.com") ||
      host.endsWith(".push.services.mozilla.com");
  } catch { return false; }
}

export function validatePushSubscription(input: unknown): BrowserPushSubscription | null {
  if (!input || typeof input !== "object") return null;
  const s = input as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (typeof s.endpoint !== "string" || !safePushEndpoint(s.endpoint) ||
    typeof s.keys?.p256dh !== "string" || typeof s.keys.auth !== "string") return null;
  try {
    const key = decode(s.keys.p256dh), auth = decode(s.keys.auth);
    if (key.length !== 65 || key[0] !== 4 || auth.length !== 16) return null;
    const check = createECDH("prime256v1");
    check.generateKeys();
    check.computeSecret(key);
  } catch { return null; }
  return { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } };
}

export function encryptPushPayload(subscription: BrowserPushSubscription, payload: string) {
  const clientPublic = decode(subscription.keys.p256dh);
  const auth = decode(subscription.keys.auth);
  if (clientPublic.length !== 65 || auth.length !== 16) throw new Error("Invalid push encryption keys");
  const ephemeral = createECDH("prime256v1");
  const serverPublic = ephemeral.generateKeys();
  const shared = ephemeral.computeSecret(clientPublic);
  const salt = randomBytes(16);
  const info = Buffer.concat([Buffer.from("WebPush: info\0"), clientPublic, serverPublic]);
  const ikm = Buffer.from(hkdfSync("sha256", shared, auth, info, 32));
  const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const plain = Buffer.concat([Buffer.from(payload, "utf8"), Buffer.from([2])]);
  const recordSize = Math.max(4096, plain.length + 17);
  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(recordSize, 16);
  header[20] = serverPublic.length;
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
  return Buffer.concat([header, serverPublic, encrypted]);
}

export function vapidAuthorization(endpoint: string, publicKey: string, privateKey: string, subject: string, now = Date.now()) {
  const url = new URL(endpoint);
  const audience = url.origin;
  const jwtHeader = encode(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const jwtPayload = encode(JSON.stringify({ aud: audience, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject }));
  const unsigned = jwtHeader + "." + jwtPayload;
  const pub = decode(publicKey);
  const signingKey = createPrivateKey({ key: {
    kty: "EC", crv: "P-256", x: encode(pub.subarray(1, 33)), y: encode(pub.subarray(33, 65)), d: privateKey
  }, format: "jwk" });
  const signature = sign("sha256", Buffer.from(unsigned), { key: signingKey, dsaEncoding: "ieee-p1363" });
  return "vapid t=" + unsigned + "." + encode(signature) + ", k=" + publicKey;
}

export async function sendWebPush(subscription: BrowserPushSubscription, message: PushMessage) {
  const config = pushConfiguration();
  if (!config) return { delivered: false, disabled: true };
  if (!safePushEndpoint(subscription.endpoint)) throw new Error("Unsafe push endpoint");
  const payload = JSON.stringify(message);
  if (Buffer.byteLength(payload) > 3000) throw new Error("Push payload too large");
  const body = encryptPushPayload(subscription, payload);
  const response = await fetch(subscription.endpoint, {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(7000),
    headers: {
      Authorization: vapidAuthorization(subscription.endpoint, config.publicKey, config.privateKey, config.subject),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "86400",
      Urgency: "normal"
    },
    body: new Uint8Array(body)
  });
  if (response.status === 404 || response.status === 410) return { delivered: false, expired: true };
  if (!response.ok) throw new Error("Web Push gateway returned HTTP " + response.status);
  return { delivered: true };
}
