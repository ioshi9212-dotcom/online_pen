import { normalizePhone } from "@/lib/phone";

export function formatPhone(input: string) {
  return normalizePhone(input);
}

export function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function formatDateOnly(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "short",
    day: "2-digit",
    month: "long"
  }).format(date);
}

export function formatTimeOnly(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function rub(value: number | null | undefined) {
  if (value == null) return "—";
  return new Intl.NumberFormat("ru-RU").format(value) + " ₽";
}
