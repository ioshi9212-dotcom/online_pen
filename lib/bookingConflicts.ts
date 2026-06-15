import { prisma } from "@/lib/prisma";

export const ACTIVE_BOOKING_STATUSES = ["PENDING", "CONFIRMED"] as const;

export async function getBookingConflictReasons(params: {
  startAt: Date;
  endAt: Date;
  ignoreBookingId?: string;
}) {
  const whereBooking: any = {
    status: { in: ACTIVE_BOOKING_STATUSES as any },
    startAt: { lt: params.endAt },
    endAt: { gt: params.startAt }
  };

  if (params.ignoreBookingId) whereBooking.id = { not: params.ignoreBookingId };

  const [booking, block] = await Promise.all([
    prisma.booking.findFirst({
      where: whereBooking,
      include: { client: true, service: true },
      orderBy: { startAt: "asc" }
    }),
    prisma.blockedSlot.findFirst({
      where: {
        startAt: { lt: params.endAt },
        endAt: { gt: params.startAt }
      },
      orderBy: { startAt: "asc" }
    })
  ]);

  const reasons: string[] = [];

  if (booking) {
    reasons.push(`наложение с записью: ${booking.client.lastName} ${booking.client.firstName}, ${booking.service.title}`);
  }

  if (block) {
    reasons.push(block.reason ? `окно закрыто: ${block.reason}` : "окно закрыто мастером");
  }

  return reasons;
}

export function isActiveBookingStatus(status: string) {
  return (ACTIVE_BOOKING_STATUSES as readonly string[]).includes(status);
}
