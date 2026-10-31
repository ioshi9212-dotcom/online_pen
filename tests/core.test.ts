import assert from "node:assert/strict";
import test from "node:test";
import { signSession, readSession } from "../lib/signedSession";
import { hashPassword, matchesPassword } from "../lib/adminPassword";
import { consumeBucket } from "../lib/rateLimit";
import { fitsWindow } from "../lib/availability";
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
