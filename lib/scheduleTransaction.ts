import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type ScheduleTx = Prisma.TransactionClient;

// Every booking, block and online-window writer shares this PostgreSQL lock.
// ReadCommitted ensures a waiting writer sees the preceding commit before checking.
export async function scheduleTransaction<T>(run: (tx: ScheduleTx) => Promise<T>) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(726416, 1)`;
    return run(tx);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 10_000, timeout: 15_000 });
}
