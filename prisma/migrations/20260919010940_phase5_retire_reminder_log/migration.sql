-- reminder_logs is superseded by the notifications outbox: the dedupe key on
-- notifications now carries (what, which record, India-local day, recipient),
-- which is exactly what this table existed to record. Keeping a table nothing
-- writes to is worse than dropping it.
--
-- The guard is deliberate. Dropping a table is not something to do on trust, so
-- this refuses to run if the table ever recorded anything, and the deploy fails
-- loudly instead of quietly discarding history.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "reminder_logs" LIMIT 1) THEN
    RAISE EXCEPTION 'reminder_logs is not empty: migrate its rows into notifications before dropping it';
  END IF;
END $$;

DROP TABLE "reminder_logs";
DROP TYPE "ReminderKind";
