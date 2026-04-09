-- CreateTable
CREATE TABLE "GuestSession" (
    "id" TEXT NOT NULL,
    "guestToken" TEXT NOT NULL,
    "trialMessageCount" INTEGER NOT NULL DEFAULT 0,
    "mergedAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestSession_pkey" PRIMARY KEY ("id")
);

CREATE OR REPLACE FUNCTION "set_guest_session_timestamps"()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW."createdAt" := CURRENT_TIMESTAMP;
    END IF;

    NEW."updatedAt" := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- AlterTable
ALTER TABLE "Chat"
    ADD COLUMN "guestSessionId" TEXT,
    ALTER COLUMN "userId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "GuestSession_guestToken_key" ON "GuestSession"("guestToken");

-- CreateIndex
CREATE INDEX "Chat_guestSessionId_updatedAt_idx" ON "Chat"("guestSessionId", "updatedAt");

-- AddForeignKey
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_guestSessionId_fkey" FOREIGN KEY ("guestSessionId") REFERENCES "GuestSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add owner XOR check
ALTER TABLE "Chat"
    ADD CONSTRAINT "Chat_owner_xor_check"
    CHECK (
        ("userId" IS NOT NULL AND "guestSessionId" IS NULL) OR
        ("userId" IS NULL AND "guestSessionId" IS NOT NULL)
    );

DROP TRIGGER IF EXISTS "guest_session_set_timestamps" ON "GuestSession";
CREATE TRIGGER "guest_session_set_timestamps"
BEFORE INSERT OR UPDATE ON "GuestSession"
FOR EACH ROW
EXECUTE FUNCTION "set_guest_session_timestamps"();
