import { prisma } from "@/lib/prisma";
import { pushConfiguration, sendWebPush, type PushMessage } from "@/lib/webPush";

/**
 * Best-effort delivery after the actual database mutation has committed.
 * Never make a client's booking/registration fail just because a push provider
 * is temporarily offline. Notification transport can be retried separately.
 */
async function sendTo(rows: Array<{ id: string; endpoint: string; p256dh: string; auth: string }>, message: PushMessage) {
  const results = await Promise.allSettled(rows.slice(0,20).map(async row => {
    try {
      const result = await sendWebPush({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, message);
      if (result.expired) await prisma.pushSubscription.deleteMany({where:{id:row.id}});
      return result.delivered ? 1 : 0;
    } catch (error) {
      console.warn("Push delivery failed:", error instanceof Error ? error.message : "unknown error");
      return 0;
    }
  }));
  return results.reduce((n, r) => n + (r.status === "fulfilled" ? r.value : 0), 0);
}

export async function notifyClient(clientId: string, message: PushMessage) {
  try {
    if (!pushConfiguration()) return 0;
    const subscriptions = await prisma.pushSubscription.findMany({ where: { clientId }, take: 40 });
    return await sendTo(subscriptions, message);
  } catch (error) {
    console.warn("Client push failed:", error instanceof Error ? error.message : "unknown error");
    return 0;
  }
}

export async function notifyMaster(message: PushMessage) {
  try {
    if (!pushConfiguration()) return 0;
    const subscriptions = await prisma.pushSubscription.findMany({ where: { isAdmin: true }, take: 40 });
    return await sendTo(subscriptions, message);
  } catch (error) {
    console.warn("Master push failed:", error instanceof Error ? error.message : "unknown error");
    return 0;
  }
}
