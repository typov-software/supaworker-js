ALTER TABLE "supaworker"."jobs"
ADD COLUMN "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT "now" () NOT NULL;

CREATE OR REPLACE FUNCTION "supaworker"."increment_attempts" ("job_id" bigint) RETURNS SETOF "supaworker"."jobs" LANGUAGE "plpgsql" AS $function$
BEGIN
  RETURN QUERY
  UPDATE "supaworker"."jobs"
  SET "attempts" = "attempts" + 1, "updated_at" = "now"()
  WHERE "id" = "job_id"
  RETURNING *;
END;
$function$;

ALTER FUNCTION "supaworker"."increment_attempts" ("job_id" bigint) OWNER TO "postgres";

CREATE INDEX jobs_queue_claimed_at_idx ON supaworker.jobs(queue, claimed_at);

ALTER PUBLICATION supabase_realtime
ADD TABLE supaworker.logs;