begin;
select plan(15);
-- Check if schema exists
select has_schema('supaworker');
-- Check if tables exist
select has_table(
    'supaworker',
    'jobs',
    'Expected table supaworker.jobs to exist'
  );
select has_table(
    'supaworker',
    'logs',
    'Expected table supaworker.logs to exist'
  );
-- Check if columns exist
select has_column(
    'supaworker',
    'jobs',
    'id',
    'Expected column supaworker.jobs.id to exist'
  );
select has_column(
    'supaworker',
    'jobs',
    'created_at',
    'Expected column supaworker.jobs.created_at to exist'
  );
select has_column(
    'supaworker',
    'jobs',
    'queue',
    'Expected column supaworker.jobs.queue to exist'
  );
select has_column(
    'supaworker',
    'jobs',
    'enabled',
    'Expected column supaworker.jobs.enabled to exist'
  );
select has_column(
    'supaworker',
    'jobs',
    'attempts',
    'Expected column supaworker.jobs.attempts to exist'
  );
select has_column(
    'supaworker',
    'jobs',
    'options',
    'Expected column supaworker.jobs.options to exist'
  );
select has_column(
    'supaworker',
    'jobs',
    'payload',
    'Expected column supaworker.jobs.payload to exist'
  );
select has_column(
    'supaworker',
    'logs',
    'id',
    'Expected column supaworker.logs.id to exist'
  );
select has_column(
    'supaworker',
    'logs',
    'created_at',
    'Expected column supaworker.logs.created_at to exist'
  );
select has_column(
    'supaworker',
    'logs',
    'job',
    'Expected column supaworker.logs.job to exist'
  );
select has_column(
    'supaworker',
    'logs',
    'status',
    'Expected column supaworker.logs.status to exist'
  );
-- Check if functions exist
select has_function(
    'supaworker',
    'dequeue',
    'Expected function supaworker.dequeue to exist'
  );
select *
from finish();
rollback;