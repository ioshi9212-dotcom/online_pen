export const CLIENT_STATUS_OPTIONS = [
  { value: "PENDING", label: "Ожидает подтверждения" },
  { value: "APPROVED", label: "Подтверждён" },
  { value: "REJECTED", label: "В архиве" },
  { value: "BANNED", label: "Заблокирован" }
] as const;

export const BOOKING_STATUS_OPTIONS = [
  { value: "PENDING", label: "Ожидает подтверждения" },
  { value: "CONFIRMED", label: "Подтверждена" },
  { value: "CANCELLED_BY_CLIENT", label: "Отменена клиентом" },
  { value: "CANCELLED_BY_ADMIN", label: "Отменена мастером" },
  { value: "REJECTED", label: "Отклонена" },
  { value: "COMPLETED", label: "Завершена" },
  { value: "NO_SHOW", label: "Неявка" }
] as const;

export function clientStatusLabel(status: string) {
  return CLIENT_STATUS_OPTIONS.find((item) => item.value === status)?.label || status;
}

export function bookingStatusLabel(status: string) {
  return BOOKING_STATUS_OPTIONS.find((item) => item.value === status)?.label || status;
}

export function statusClass(status: string) {
  if (["APPROVED", "CONFIRMED", "COMPLETED"].includes(status)) return "ok";
  if (["PENDING"].includes(status)) return "wait";
  if (["BANNED", "REJECTED", "CANCELLED_BY_CLIENT", "CANCELLED_BY_ADMIN", "NO_SHOW"].includes(status)) return "bad";
  return "";
}
