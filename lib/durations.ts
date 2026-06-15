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

export function durationLabel(minutes: number | null | undefined) {
  const match = DURATION_OPTIONS.find((option) => option.value === minutes);
  return match?.label ?? `${minutes ?? 0} мин`;
}
