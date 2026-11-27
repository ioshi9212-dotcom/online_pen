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
  let saved = 0, applied = 0, savedAll = 0;
  const fromDb = [
    { name: "Вариант 1", times: [] as string[] },
    { name: "Вариант 2", times: [] as string[] },
    { name: "Вариант 3", times: [] as string[] }
  ];
  const endpoint = loadModule("app/admin/schedule/presets/route.ts", {
    "@/lib/admin": { isAdmin: async () => admin },
    "@/lib/windowPresets": {
      WindowPresetError,
      saveWindowPreset: async (index: number, name: unknown, times: unknown) => {
        if (!Number.isInteger(index) || index < 0 || index > 2) throw new WindowPresetError("Неверный вариант");
        saved++;
        fromDb[index] = normalizeWindowPreset(name, times);
        return fromDb[index];
      },
      listWindowPresets: async () => fromDb.map((row) => ({ ...row, times: [...row.times] })),
      saveAllWindowPresets: async (input: unknown) => {
        if (!Array.isArray(input) || input.length !== 3) throw new WindowPresetError("Три варианта");
        const parsed = input.map((row: any) => normalizeWindowPreset(row.name, row.times));
        if (parsed.some((row) => !row.times.length)) throw new WindowPresetError("Все три должны быть заполнены");
        parsed.forEach((row, index) => { fromDb[index] = row; });
        savedAll++;
        return fromDb.map((row) => ({ ...row, times: [...row.times] }));
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
  return { endpoint, counts: () => ({saved,applied,savedAll}), fromDb };
}

test("only an authenticated master from the same origin can save/apply a preset", async () => {
  const a = setup();
  assert.equal((await a.endpoint.POST(req({action:"apply",index:0,date:"2026-12-01"}, "http://evil.test"))).status, 403);
  const b = setup(false);
  assert.equal((await b.endpoint.POST(req({action:"apply",index:0,date:"2026-12-01"}))).status, 401);
  assert.deepEqual(a.counts(),{saved:0,applied:0,savedAll:0});
  assert.deepEqual(b.counts(),{saved:0,applied:0,savedAll:0});
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
  assert.deepEqual(a.counts(),{saved:1,applied:1,savedAll:0});
});


test("each of three variants can be saved separately without replacing the others", async () => {
  const a = setup();
  for (const [index, name, times] of [[0, "Утро", "09:00"], [1, "День", "12:00, 14:00"], [2, "Вечер", "17:00, 19:00"]] as const) {
    const response = await a.endpoint.POST(req({ action: "save", index, name, times }));
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.presets[index].name, name);
  }
  assert.deepEqual(a.fromDb.map((row) => row.name), ["Утро", "День", "Вечер"]);
  assert.deepEqual(a.counts(), {saved:3,applied:0,savedAll:0});
  const loaded = await a.endpoint.GET();
  assert.deepEqual((await loaded.json()).presets.map((row: any) => row.name), ["Утро", "День", "Вечер"]);
});

test("save-all persists three slots, but refuses partial or invalid sets", async () => {
  const a = setup();
  const presets = [
    { name:"Утро", times:"09:00, 10:00" },
    { name:"День", times:"12:00, 14:00" },
    { name:"Вечер", times:"17:00, 19:00" }
  ];
  assert.equal((await a.endpoint.POST(req({ action: "save-all", presets: [...presets.slice(0,2), {name:"Третий",times:""}] }))).status, 400);
  assert.equal(a.counts().savedAll, 0);
  const ok = await a.endpoint.POST(req({ action: "save-all", presets }));
  assert.equal(ok.status, 200);
  const result = await ok.json();
  assert.deepEqual(result.presets.map((row: any) => row.name), ["Утро", "День", "Вечер"]);
  assert.deepEqual(a.counts(), {saved:0, applied:0, savedAll:1});
});
