Supaworker is a job queue for Supabase projects.

> **Note:** This is a work in progress and is not yet ready for production use.

### License

[MIT](./LICENSE)

## Usage

Supaworker is a job queue that is backed by your Supabase database.
Jobs are enqueued as rows in a `supaworker_jobs` table where background workers can pick them up and process them.

A worker is a Supaworker client does the following:

1. Dequeues jobs that match the worker's `queue`
2. Processes jobs until there are none left
2. Listens for new jobs using Supabase's Realtime feature

Timeouts, delayed retries, and scale are left to the developer.

### Setup

Create a new migration

```bash
supabase migration new setup_supaworker
```

And add the following SQL from [here](./supabase/migrations/20240407025302_setup_supaworker.sql).

Then run the migration:

```bash
supabase migration up --local
```

From Supabase studio, head to Database -> Replication. In the row named "supabase_realtime", click the "_x_ table(s)" button under the "Source" column and toggle the "supaworker_jobs" table to enabled.

### Installation

Add Supaworker to your project:

```bash
npm install --save @typov/supaworker-js
```
