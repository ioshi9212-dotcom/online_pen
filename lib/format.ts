import { normalizePhone } from "@/lib/phone";
import { formatInBusinessTime } from "@/lib/timezone";

export function formatPhone(input: string) {
  return normalizePhone(input);
}

export function formatDateTime(date: Date) {
  return formatInBusinessTime(date, {
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function formatDateOnly(date: Date) {
  return formatInBusinessTime(date, {
    weekday: "short",
    day: "2-digit",
    month: "long"
  });
}

export function formatTimeOnly(date: Date) {
  return formatInBusinessTime(date, {
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function rub(value: number | null | undefined) {
  if (value == null) return "—";
  return new Intl.NumberFormat("ru-RU").format(value) + " ₽";
}
