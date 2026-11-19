CREATE TABLE "PushSubscription" (
  "id" TEXT NOT NULL,
  "endpoint" VARCHAR(1000) NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "isAdmin" BOOLEAN NOT NULL DEFAULT false,
  "clientId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE INDEX "PushSubscription_clientId_idx" ON "PushSubscription"("clientId");
CREATE INDEX "PushSubscription_isAdmin_idx" ON "PushSubscription"("isAdmin");
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
