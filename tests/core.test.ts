import assert from "node:assert/strict";
import test from "node:test";
import { signSession, readSession } from "../lib/signedSession";
import { hashPassword, matchesPassword } from "../lib/adminPassword";
import { consumeBucket } from "../lib/rateLimit";
import { fitsWindow } from "../lib/availability";
import { splitClientBookings } from "../lib/clientBookingViews";
import { createDecipheriv, createECDH, createHmac, hkdfSync, createPublicKey, verify, randomBytes } from "node:crypto";
import { encryptPushPayload, safePushEndpoint, validatePushSubscription, vapidAuthorization } from "../lib/webPush";
import { businessMonthBounds, businessDateFromKey, businessDateTimeFromKeyAndTime } from "../lib/timezone";
import { validDateKey, validTime, parseBirthDate } from "../lib/validation";

process.env.ADMIN_SECRET = "automated-test-secret-not-for-production";

test("sessions reject expiration, tampering, another role and legacy cookies", () => {
  const now = Date.UTC(2026, 9, 31);
  const token = signSession("client-id", "client", 60, now);
  assert.equal(readSession(token, "client", now), "client-id");
  assert.equal(readSession(token, "admin", now), "");
  assert.equal(readSession(token, "client", now + 60_000), "");
  assert.equal(readSession(token.replace("client-id", "other-id"), "client", now), "");
  process.env.CLIENT_SESSION_SECRET = "different-client-test-secret";
  assert.equal(readSession(token, "client", now), "");
  delete process.env.CLIENT_SESSION_SECRET;
  assert.equal(readSession("old-static-admin-token", "admin", now), "");
  assert.equal(readSession("uuid.old-hmac", "client", now), "");
  assert.notEqual(signSession("version-1", "admin", 60, now), signSession("version-1", "admin", 60, now));
});

test("password hashes use a fresh salt and verify without storing plaintext", async () => {
  const a = await hashPassword("test-password-123");
  const b = await hashPassword("test-password-123");
  assert.notEqual(a, b);
  assert.equal(a.includes("test-password-123"), false);
  assert.equal(await matchesPassword("test-password-123", a), true);
  assert.equal(await matchesPassword("wrong-password", a), false);
  assert.equal(await matchesPassword("test-password-123", "scrypt$bad$bad"), false);
});

test("a long rate-limit block survives expiration of its counting window", () => {
  const options = { limit: 1, windowMs: 60_000, blockMs: 300_000 };
  const first = consumeBucket(undefined, options, 0);
  const blocked = consumeBucket(first.bucket, options, 1);
  assert.equal(blocked.ok, false);
  assert.equal(consumeBucket(blocked.bucket, options, 61_000).ok, false);
  assert.equal(consumeBucket(blocked.bucket, options, 300_002).ok, true);
});

test("service duration includes preceding bookings, blocks and workday end", () => {
  const start = new Date("2030-11-01T04:00:00Z");
  const busy = [{ startAt: new Date("2030-11-01T05:00:00Z"), endAt: new Date("2030-11-01T07:00:00Z") }];
  assert.equal(fitsWindow(start, 60, busy), true);
  assert.equal(fitsWindow(start, 150, busy), false);
  assert.equal(fitsWindow(new Date("2030-11-01T06:00:00Z"), 30, busy), false);
  assert.equal(fitsWindow(start, 120, [], new Date("2030-11-01T05:00:00Z")), false);
});

test("business month includes the first day's midnight and 09:00 on a UTC server", () => {
  const bounds = businessMonthBounds("2026-11");
  assert.equal(bounds.start.toISOString(), "2026-10-31T14:00:00.000Z");
  assert.equal(bounds.end.toISOString(), "2026-11-30T14:00:00.000Z");
  for (const date of [businessDateFromKey("2026-11-01"), businessDateTimeFromKeyAndTime("2026-11-01", "09:00")]) assert.ok(date >= bounds.start && date < bounds.end);
  assert.throws(() => businessMonthBounds("2026-13"));
});

test("dates and times reject impossible values before database writes", () => {
  assert.equal(validDateKey("2026-02-31"), false);
  assert.equal(validDateKey("2028-02-29"), true);
  assert.equal(validTime("24:10"), false);
  assert.equal(validTime("09:30"), true);
  assert.throws(() => parseBirthDate("2099-01-01"));
});

test("client booking history retains old pending/confirmed entries, newest first", () => {
  const now = new Date("2030-11-20T10:00:00Z");
  const make = (id: string, iso: string, status: string) => ({id, startAt:new Date(iso),status});
  const items = [
    make("future-later","2030-11-25T11:00:00Z","CONFIRMED"),
    make("old-pending","2030-11-19T11:00:00Z","PENDING"),
    make("cancelled","2030-11-18T12:00:00Z","CANCELLED_BY_CLIENT"),
    make("future-sooner","2030-11-21T11:00:00Z","PENDING"),
    make("old-confirmed","2030-11-20T09:00:00Z","CONFIRMED")
  ];
  const {activeBookings,pastBookings}=splitClientBookings(items,now);
  assert.deepEqual(activeBookings.map(x=>x.id),["future-sooner","future-later"]);
  assert.deepEqual(pastBookings.map(x=>x.id),["old-confirmed","old-pending","cancelled"]);
  assert.deepEqual(items.map(x=>x.id),["future-later","old-pending","cancelled","future-sooner","old-confirmed"]);
});

test("Web Push endpoints reject non-provider domains and private network URLs", () => {
  assert.equal(safePushEndpoint("http://localhost:3000/push"),false);
  assert.equal(safePushEndpoint("https://127.0.0.1/secret"),false);
  assert.equal(safePushEndpoint("https://fcm.googleapis.com/push?id=a"),true);
  assert.equal(safePushEndpoint("https://web.push.apple.com/Qxxxxx"),true);
  assert.equal(safePushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/test"),true);
  assert.equal(safePushEndpoint("https://attacker.com/.push.apple.com"),false);
  assert.equal(validatePushSubscription({endpoint:"http://localhost",keys:{auth:"test",p256dh:"test"}}),null);
});

test("encrypted Web Push payload decrypts with the receiver key per RFC 8291", () => {
  const receiver=createECDH("prime256v1"),publicKey=receiver.generateKeys();
  const auth=randomBytes(16);
  const data={endpoint:"https://fcm.googleapis.com/fcm/send/test",keys:{p256dh:publicKey.toString("base64url"),auth:auth.toString("base64url")}};
  assert.ok(validatePushSubscription(data));
  const message=JSON.stringify({title:"Тест",body:"Привет!",url:"/my"});
  const record=encryptPushPayload(data,message);
  const salt=record.subarray(0,16);
  const rs=record.readUInt32BE(16);
  const keyLength=record[20];
  assert.equal(keyLength,65);
  assert.ok(rs>=4096);
  const senderPublic=record.subarray(21,21+keyLength);
  const shared=receiver.computeSecret(senderPublic);
  const info=Buffer.concat([Buffer.from("WebPush: info\0"),publicKey,senderPublic]);
  const ikm=Buffer.from(hkdfSync("sha256",shared,auth,info,32));
  const cek=Buffer.from(hkdfSync("sha256",ikm,salt,Buffer.from("Content-Encoding: aes128gcm\0"),16));
  const nonce=Buffer.from(hkdfSync("sha256",ikm,salt,Buffer.from("Content-Encoding: nonce\0"),12));
  const payload=record.subarray(21+keyLength);
  const cipher=createDecipheriv("aes-128-gcm",cek,nonce);
  cipher.setAuthTag(payload.subarray(-16));
  const clear=Buffer.concat([cipher.update(payload.subarray(0,-16)),cipher.final()]);
  assert.equal(clear.at(-1),2);
  assert.equal(clear.subarray(0,-1).toString("utf8"),message);
});

test("VAPID JWT signs correct push origin, expiry and subject", () => {
  const privateEcdh=createECDH("prime256v1");
  const pub=privateEcdh.generateKeys().toString("base64url");
  const priv=privateEcdh.getPrivateKey().toString("base64url");
  const header=vapidAuthorization("https://fcm.googleapis.com/path",pub,priv,"mailto:test@example.com",Date.UTC(2026,10,19));
  assert.match(header,/^vapid t=/);
  const token=header.split("t=")[1].split(", k=")[0];
  const [h,p,s]=token.split(".");
  const claims=JSON.parse(Buffer.from(p,"base64url").toString());
  assert.equal(claims.aud,"https://fcm.googleapis.com");
  assert.equal(claims.sub,"mailto:test@example.com");
  assert.ok(claims.exp<=Date.UTC(2026,10,20)/1000);
  assert.equal(JSON.parse(Buffer.from(h,"base64url").toString()).alg,"ES256");
  const raw=Buffer.from(pub,"base64url");
  const key=createPublicKey({key:{kty:"EC",crv:"P-256",x:raw.subarray(1,33).toString("base64url"),y:raw.subarray(33,65).toString("base64url")},format:"jwk"});
  assert.equal(verify("sha256",Buffer.from(h+"."+p),{key,dsaEncoding:"ieee-p1363"},Buffer.from(s,"base64url")),true);
});
