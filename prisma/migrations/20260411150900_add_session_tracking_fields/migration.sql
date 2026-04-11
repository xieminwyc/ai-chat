-- Add session tracking fields: lastActiveAt, deviceInfo, ipAddress
ALTER TABLE "Session" ADD COLUMN "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Session" ADD COLUMN "deviceInfo" JSONB;
ALTER TABLE "Session" ADD COLUMN "ipAddress" TEXT;

-- Add index for efficient queries on userId + lastActiveAt
CREATE INDEX "Session_userId_lastActiveAt_idx" ON "Session"("userId", "lastActiveAt");
