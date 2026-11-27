import assert from "node:assert/strict";
import test from "node:test";
import { NextResponse } from "next/server";
import { loadModule } from "./load-module";
import { parseScheduleMessage, readScheduleAnnouncement, SCHEDULE_ANNOUNCEMENT_KEY } from "../lib/scheduleAnnouncement";
import { sameOriginRequest } from "../lib/sameOrigin";

test("schedule announcement text is bounded and always plain text", () => {
  assert.equal(parseScheduleMessage({ title: "   ", body: "Text here" }), null);
  assert.equal(parseScheduleMessage({ title: "Opened", body: " x " }), null);
  assert.equal(parseScheduleMessage({ title: "X".repeat(81), body: "Good text" }), null);
  assert.equal(parseScheduleMessage({ title: "Open", body: "b".repeat(241) }), null);
  assert.deepEqual(parseScheduleMessage({ title: "  Открыта  запись ", body: "Можно   записаться!" }), { title: "Открыта запись", body: "Можно записаться!" });
  assert.equal(readScheduleAnnouncement("bad json"), null);
  assert.equal(readScheduleAnnouncement(JSON.stringify({ title: "X", body: "12345", publishedAt: "2026-11-27T00:00:00Z" }))?.body, "12345");
});

function request(body: unknown, origin = "http://localhost") {
  return new Request("http://localhost/api/admin/schedule-broadcast", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
const message = { title: "Открыт декабрь", body: "Появились новые свободные окна, записывайтесь!" };

function route(options: { admin?: boolean; push?: boolean; subscribers?: any[]; last?: Date } = {}) {
  const subscribers = options.subscribers || [];
  let published = "", sent = 0, expired = 0;
  const prisma = {
    setting: {
      findUnique: async () => options.last ? { updatedAt: options.last, value: "" } : null,
      create: async ({ data }: any) => { published = data.value; },
      updateMany: async ({ data }: any) => { published = data.value; return { count: 1 }; }
    },
    pushSubscription: {
      count: async () => subscribers.length,
      findMany: async ({ where, cursor, take }: any) => {
        assert.equal(where.isAdmin, false);
        assert.deepEqual(where.client.status.in, ["PENDING", "APPROVED"]);
        const index = cursor ? subscribers.findIndex(r => r.id === cursor.id) + 1 : 0;
        return subscribers.slice(index, index + take);
      },
      deleteMany: async () => { expired++; }
    }
  };
  const api = loadModule("app/api/admin/schedule-broadcast/route.ts", {
    "@/lib/admin": { isAdmin: async () => options.admin !== false },
    "@/lib/prisma": { prisma },
    "@/lib/sameOrigin": { sameOriginRequest },
    "@/lib/scheduleAnnouncement": { parseScheduleMessage, SCHEDULE_ANNOUNCEMENT_KEY, SCHEDULE_BROADCAST_COOLDOWN_MS: 300_000 },
    "@/lib/webPush": { pushConfiguration: () => options.push === false ? null : {}, sendWebPush: async ({endpoint}:any) => { sent++; return endpoint === "expired" ? {expired: true, delivered:false} : {delivered:true}; } },
    "next/server": { NextResponse }
  });
  return { api, results: () => ({ published, sent, expired }) };
}

test("schedule broadcast requires origin and master authorization", async () => {
  const a = route();
  assert.equal((await a.api.POST(request(message, "http://attacker.test"))).status, 403);
  const b = route({admin:false});
  assert.equal((await b.api.POST(request(message))).status, 401);
  assert.deepEqual(a.results(), {published:"",sent:0,expired:0});
  assert.deepEqual(b.results(), {published:"",sent:0,expired:0});
});

test("schedule broadcast rejects empty and oversized messages", async () => {
  const a = route();
  assert.equal((await a.api.POST(request({ title: "", body: "" }))).status, 400);
  assert.equal((await a.api.POST(request({ title: "A", body: "x".repeat(500) }))).status, 400);
  assert.equal(a.results().published, "");
});

test("schedule broadcast posts even without push subscriptions", async () => {
  const a = route({push:false});
  const response = await a.api.POST(request(message));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).pushEnabled, false);
  assert.equal(JSON.parse(a.results().published).body, message.body);
  assert.equal(a.results().sent, 0);
});

test("schedule broadcast sends to approved and pending subscriptions, removes expired", async () => {
  const rows = Array.from({length: 58}, (_, i) => ({id:`sub-${String(i).padStart(2,"0")}`,endpoint:i===0?"expired":"safe",p256dh:"key",auth:"auth"}));
  const a = route({subscribers:rows});
  const response = await a.api.POST(request(message));
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.devices, 58);
  assert.equal(data.accepted, 57);
  assert.equal(data.failed, 1);
  assert.equal(a.results().sent, 58);
  assert.equal(a.results().expired, 1);
});

test("schedule broadcast is rate limited for five minutes", async () => {
  const a = route({last:new Date()});
  assert.equal((await a.api.POST(request(message))).status,429);
  assert.equal(a.results().sent,0);
});
