-- Repair timestamps written through Prisma's skewed timestamptz path during local dev
-- before moving all chat/message timestamps to database-managed triggers.
UPDATE "Message"
SET "createdAt" = "createdAt" + INTERVAL '8 hours'
WHERE "createdAt" >= TIMESTAMPTZ '2026-03-25 02:30:00+08'
  AND "createdAt" < TIMESTAMPTZ '2026-03-25 03:12:00+08';

UPDATE "Chat"
SET
  "createdAt" = CASE
    WHEN "createdAt" >= TIMESTAMPTZ '2026-03-25 02:30:00+08'
      AND "createdAt" < TIMESTAMPTZ '2026-03-25 03:12:00+08'
      THEN "createdAt" + INTERVAL '8 hours'
    ELSE "createdAt"
  END,
  "updatedAt" = CASE
    WHEN "updatedAt" >= TIMESTAMPTZ '2026-03-25 02:30:00+08'
      AND "updatedAt" < TIMESTAMPTZ '2026-03-25 03:12:00+08'
      THEN "updatedAt" + INTERVAL '8 hours'
    ELSE "updatedAt"
  END
WHERE (
  "createdAt" >= TIMESTAMPTZ '2026-03-25 02:30:00+08'
  AND "createdAt" < TIMESTAMPTZ '2026-03-25 03:12:00+08'
) OR (
  "updatedAt" >= TIMESTAMPTZ '2026-03-25 02:30:00+08'
  AND "updatedAt" < TIMESTAMPTZ '2026-03-25 03:12:00+08'
);

CREATE OR REPLACE FUNCTION "set_chat_timestamps"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW."createdAt" := CURRENT_TIMESTAMP;
  END IF;

  NEW."updatedAt" := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "set_message_created_at"()
RETURNS TRIGGER AS $$
BEGIN
  NEW."createdAt" := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "touch_chat_after_message_insert"()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE "Chat"
  SET "updatedAt" = CURRENT_TIMESTAMP
  WHERE "id" = NEW."chatId";

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "chat_set_timestamps" ON "Chat";
CREATE TRIGGER "chat_set_timestamps"
BEFORE INSERT OR UPDATE ON "Chat"
FOR EACH ROW
EXECUTE FUNCTION "set_chat_timestamps"();

DROP TRIGGER IF EXISTS "message_set_created_at" ON "Message";
CREATE TRIGGER "message_set_created_at"
BEFORE INSERT ON "Message"
FOR EACH ROW
EXECUTE FUNCTION "set_message_created_at"();

DROP TRIGGER IF EXISTS "message_touch_chat_after_insert" ON "Message";
CREATE TRIGGER "message_touch_chat_after_insert"
AFTER INSERT ON "Message"
FOR EACH ROW
EXECUTE FUNCTION "touch_chat_after_message_insert"();
