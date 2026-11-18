export function fitsWindow(startAt: Date, durationMinutes: number, busy: Array<{ startAt: Date; endAt: Date }>, availableUntil?: Date) {
  const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);
  return durationMinutes > 0 && Number.isFinite(endAt.getTime()) && (!availableUntil || endAt <= availableUntil) && !busy.some((item) => startAt < item.endAt && endAt > item.startAt);
}
