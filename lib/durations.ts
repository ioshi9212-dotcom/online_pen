export const DURATION_OPTIONS = [
  { value: 30, label: "30 минут" },
  { value: 60, label: "1 час" },
  { value: 90, label: "1,5 часа" },
  { value: 120, label: "2 часа" },
  { value: 150, label: "2,5 часа" },
  { value: 180, label: "3 часа" },
  { value: 210, label: "3,5 часа" },
  { value: 240, label: "4 часа" }
];

export function durationLabel(minutes: number) {
  return DURATION_OPTIONS.find((item) => item.value === minutes)?.label || `${minutes} мин`;
}

export function safeDuration(value: FormDataEntryValue | null, fallback = 150) {
  const parsed = Number(value);
  return DURATION_OPTIONS.some((item) => item.value === parsed) ? parsed : fallback;
}
