import assert from "node:assert/strict";
import test from "node:test";
import { NextResponse } from "next/server";
import { loadModule } from "./load-module";
import { normalizeWindowPreset, readWindowPreset, readWindowPresets, WindowPresetError } from "../lib/windowPresets";
import { sameOriginRequest } from "../lib/sameOrigin";

test("a preset accepts comma/space/newline time lists, deduplicates and orders them", () => {
  assert.deepEqual(normalizeWindowPreset("Утро", "12:00, 09:00\n12:00; 10:30"), {
    name: "Утро", times: ["09:00", "10:30", "12:00"]
  });
  assert.deepEqual(readWindowPresets([]), [
    {name:"Вариант 1",times:[]}, {name:"Вариант 2",times:[]}, {name:"Вариант 3",times:[]}
  ]);
  assert.deepEqual(readWindowPreset(JSON.stringify({ name: "Вечер", times: ["18:00"] }), 2), { name:"Вечер", times:["18:00"] });
  assert.deepEqual(readWindowPreset("{broken", 0), { name:"Вариант 1", times:[] });
});

test("presets reject invalid clock values, arbitrary indices and oversized names", () => {
  assert.throws(() => normalizeWindowPreset("", "10:00"), WindowPresetError);
  assert.throws(() => normalizeWindowPreset("X".repeat(41), "10:00"), WindowPresetError);
  assert.throws(() => normalizeWindowPreset("Время", "25:00"), WindowPresetError);
  assert.throws(() => normalizeWindowPreset("Время", "10:00, hello"), WindowPresetError);
  assert.throws(() => readWindowPreset("", 3), WindowPresetError);
  assert.throws(() => readWindowPreset("", -1), WindowPresetError);
});

function req(input: unknown, origin = "http://localhost") {
  return new Request("http://localhost/admin/schedule/presets", {
    method: "POST", headers: { "Content-Type": "application/json", origin }, body: JSON.stringify(input)
  });
}

function setup(admin = true) {
  let saved = 0, applied = 0;
  const endpoint = loadModule("app/admin/schedule/presets/route.ts", {
    "@/lib/admin": { isAdmin: async () => admin },
    "@/lib/windowPresets": {
      WindowPresetError,
      saveWindowPreset: async (index: number, name: unknown, times: unknown) => {
        if (index !== 0) throw new WindowPresetError("Неверный вариант");
        saved++;
        return normalizeWindowPreset(name, times);
      },
      applyWindowPreset: async (date: string, index: number) => {
        if (date !== "2026-12-01" || index !== 0) throw new WindowPresetError("Неверная дата или вариант");
        applied++;
        return { added: 2, addedTimes: ["10:00", "12:00"], alreadyOpen: 1, unavailable: 0 };
      }
    },
    "@/lib/sameOrigin": { sameOriginRequest },
    "next/cache": { revalidatePath: () => {} },
    "next/server": { NextResponse }
  });
  return { endpoint, counts: () => ({saved,applied}) };
}

test("only an authenticated master from the same origin can save/apply a preset", async () => {
  const a = setup();
  assert.equal((await a.endpoint.POST(req({action:"apply",index:0,date:"2026-12-01"}, "http://evil.test"))).status, 403);
  const b = setup(false);
  assert.equal((await b.endpoint.POST(req({action:"apply",index:0,date:"2026-12-01"}))).status, 401);
  assert.deepEqual(a.counts(),{saved:0,applied:0});
  assert.deepEqual(b.counts(),{saved:0,applied:0});
});

test("the route validates actions and forwards only one requested variant", async () => {
  const a = setup();
  const first = await a.endpoint.POST(req({action:"save",index:0,name:"Утро",times:"11:00, 09:00"}));
  assert.equal(first.status, 200);
  assert.deepEqual((await first.json()).preset.times, ["09:00", "11:00"]);
  const second = await a.endpoint.POST(req({action:"apply",index:0,date:"2026-12-01"}));
  assert.equal(second.status, 200);
  assert.equal((await second.json()).added, 2);
  assert.equal((await a.endpoint.POST(req({action:"apply",index:9,date:"2026-12-01"}))).status, 400);
  assert.equal((await a.endpoint.POST(req({action:"clear-all"}))).status, 400);
  assert.deepEqual(a.counts(),{saved:1,applied:1});
});
