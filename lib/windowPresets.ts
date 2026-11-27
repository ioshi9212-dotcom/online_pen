import { prisma } from "@/lib/prisma";
import { getEffectiveDay, generateTimeList, getSettingInt } from "@/lib/schedule";
import { scheduleTransaction } from "@/lib/scheduleTransaction";
import { addBusinessDays, businessDateFromKey, businessDateKey, businessDateTimeFromKeyAndTime } from "@/lib/timezone";
import { validDateKey, validTime } from "@/lib/validation";

export type WindowPreset = { name: string; times: string[] };
export class WindowPresetError extends Error {}
export const WINDOW_PRESET_KEYS = ["online_window_preset_1", "online_window_preset_2", "online_window_preset_3"] as const;

function presetKey(index: number) {
  if (!Number.isInteger(index) || index < 0 || index >= WINDOW_PRESET_KEYS.length)
    throw new WindowPresetError("Выберите один из трёх шаблонов.");
  return WINDOW_PRESET_KEYS[index];
}

export function normalizeWindowPreset(nameValue: unknown, timesValue: unknown): WindowPreset {
  if (typeof nameValue !== "string" || nameValue.trim().length < 1 || nameValue.trim().length > 40)
    throw new WindowPresetError("Название шаблона: от 1 до 40 символов.");
  let times: string[];
  if (typeof timesValue === "string") {
    if (timesValue.length > 2000) throw new WindowPresetError("Слишком длинный список времени.");
    times = timesValue.trim() ? timesValue.trim().split(/[\s,;]+/) : [];
  } else if (Array.isArray(timesValue) && timesValue.every((item) => typeof item === "string")) {
    times = timesValue;
  } else throw new WindowPresetError("Укажите часы в формате 10:00, 12:00, 14:00.");
  if (times.length > 96 || times.some((time) => !validTime(time)))
    throw new WindowPresetError("Проверьте время: 10:00, 12:00, 14:00. Максимум 96 окон.");
  return { name: nameValue.trim(), times: [...new Set(times)].sort() };
}

export function readWindowPreset(value: string | null | undefined, index: number): WindowPreset {
  presetKey(index);
  if (value) {
    try {
      const raw: unknown = JSON.parse(value);
      if (raw && typeof raw === "object") {
        const data = raw as Record<string, unknown>;
        return normalizeWindowPreset(data.name, data.times);
      }
    } catch { /* Unparseable legacy data must not break the calendar. */ }
  }
  return { name: "Вариант " + (index + 1), times: [] };
}

export function readWindowPresets(settings: Array<{ key: string; value: string }>): WindowPreset[] {
  return WINDOW_PRESET_KEYS.map((key, index) => readWindowPreset(settings.find((item) => item.key === key)?.value, index));
}

export async function saveWindowPreset(index: number, name: unknown, times: unknown) {
  const key = presetKey(index);
  const preset = normalizeWindowPreset(name, times);
  if (!preset.times.length) throw new WindowPresetError("Добавьте хотя бы одно время в шаблон.");
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: JSON.stringify(preset) },
    update: { value: JSON.stringify(preset) }
  });
  return preset;
}

/** Confirm what is actually persisted in PostgreSQL; not just browser state. */
export async function listWindowPresets(): Promise<WindowPreset[]> {
  const saved = await prisma.setting.findMany({ where: { key: { in: [...WINDOW_PRESET_KEYS] } } });
  return readWindowPresets(saved);
}

/** Save all three independently in one PostgreSQL transaction. */
export async function saveAllWindowPresets(input: unknown): Promise<WindowPreset[]> {
  if (!Array.isArray(input) || input.length !== 3)
    throw new WindowPresetError("Для общего сохранения заполните все три варианта.");
  const presets = input.map((value) => {
    const obj = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const preset = normalizeWindowPreset(obj.name, obj.times);
    if (!preset.times.length) throw new WindowPresetError("Заполните время в каждом из трёх шаблонов.");
    return preset;
  });
  await prisma.$transaction(presets.map((preset, index) => prisma.setting.upsert({
    where: { key: WINDOW_PRESET_KEYS[index] },
    create: { key: WINDOW_PRESET_KEYS[index], value: JSON.stringify(preset) },
    update: { value: JSON.stringify(preset) }
  })));
  return listWindowPresets();
}

/** Add missing windows only. Never replace existing online windows or bookings. */
export async function applyWindowPreset(date: string, index: number) {
  const key = presetKey(index);
  if (!validDateKey(date)) throw new WindowPresetError("Проверьте дату.");
  const day = businessDateFromKey(date);
  const end = businessDateFromKey(addBusinessDays(date, 1));
  return scheduleTransaction(async (tx) => {
    const [stored, rules, overrides, settings, existing, bookings, blocks] = await Promise.all([
      tx.setting.findUnique({ where: { key } }),
      tx.scheduleRule.findMany(),
      tx.dayOverride.findMany({ where: { date: { gte: day, lt: end } } }),
      tx.setting.findMany({ where: { key: { in: ["SLOT_STEP_MINUTES", "slot_step_minutes"] } } }),
      tx.onlineWindow.findMany({ where: { startAt: { gte: day, lt: end } }, select: { startAt: true } }),
      tx.booking.findMany({ where: { status: { in: ["PENDING", "CONFIRMED"] }, startAt: { lt: end }, endAt: { gt: day } }, select: { startAt: true, endAt: true } }),
      tx.blockedSlot.findMany({ where: { startAt: { lt: end }, endAt: { gt: day } }, select: { startAt: true, endAt: true } })
    ]);
    const preset = readWindowPreset(stored?.value, index);
    if (!preset.times.length) throw new WindowPresetError("Сначала сохраните время в этом шаблоне.");
    const effective = getEffectiveDay(day, rules, overrides);
    if (!effective.isWorkingDay) throw new WindowPresetError("Сначала отметьте выбранный день как рабочий.");
    const requestedStep = getSettingInt(settings, "SLOT_STEP_MINUTES", getSettingInt(settings, "slot_step_minutes", 30));
    const step = [15, 30, 45, 60, 90, 150].includes(requestedStep) ? requestedStep : 30;
    const availableTimes = new Set(generateTimeList(effective.startTime, effective.endTime, step));
    const existingTimestamps = new Set(existing.map((item) => item.startAt.getTime()));
    const now = new Date();
    const addedTimes: string[] = [];
    let alreadyOpen = 0;
    let unavailable = 0;
    for (const time of preset.times) {
      const startAt = businessDateTimeFromKeyAndTime(date, time);
      if (!availableTimes.has(time) || startAt <= now || businessDateKey(startAt) !== date ||
        [...bookings, ...blocks].some((item) => item.startAt <= startAt && item.endAt > startAt)) {
        unavailable++;
      } else if (existingTimestamps.has(startAt.getTime())) {
        alreadyOpen++;
      } else {
        addedTimes.push(time);
      }
    }
    const created = addedTimes.length ? await tx.onlineWindow.createMany({
      data: addedTimes.map((time) => ({ startAt: businessDateTimeFromKeyAndTime(date, time), note: "Добавлено из шаблона" })),
      skipDuplicates: true
    }) : { count: 0 };
    return { added: created.count, addedTimes, alreadyOpen, unavailable };
  });
}
