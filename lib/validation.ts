import { businessDateFromKey, businessDateKey } from "@/lib/timezone";

export function validDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = businessDateFromKey(value);
  return Number.isFinite(date.getTime()) && businessDateKey(date) === value;
}

export function validTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function parseBirthDate(value: string) {
  if (!validDateKey(value)) throw new Error("Проверьте дату рождения");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (date > new Date()) throw new Error("Проверьте дату рождения");
  return date;
}
