/**
 * A booking is actionable only until its scheduled start time. An old PENDING
 * or CONFIRMED booking does not disappear; it moves into the visible history
 * even when the master has not yet marked the visit completed.
 *
 * The input is never mutated. Keep recent history first.
 */
export function splitClientBookings<T extends { status: string; startAt: Date }>(
  bookings: readonly T[],
  now: Date
): { activeBookings: T[]; pastBookings: T[] } {
  const activeBookings: T[] = [];
  const pastBookings: T[] = [];
  for (const booking of bookings) {
    if ((booking.status === "PENDING" || booking.status === "CONFIRMED") && booking.startAt > now) {
      activeBookings.push(booking);
    } else {
      pastBookings.push(booking);
    }
  }
  activeBookings.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  pastBookings.sort((a, b) => b.startAt.getTime() - a.startAt.getTime());
  return { activeBookings, pastBookings };
}
