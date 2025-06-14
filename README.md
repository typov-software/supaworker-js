Supaworker is a job queue for Supabase projects.

### License

[MIT](./LICENSE)

## Usage

Supaworker is a job queue that is backed by your Supabase database.
Jobs are enqueued as rows in a `"supaworker"."jobs"` table where background workers can dequeue and process them.

A worker does the following:

1. Dequeues jobs that match the worker's `queue`
2. Processes jobs until there are none left
3. Listens for new jobs using Supabase's Realtime feature

Timeouts, delayed retries, and scale are left to the developer.

Supaworker is _**not**_ designed to be used with Edge Functions, but instead with dedicated worker processes -- usually docker containers. This allows the developer to control the environment, runtime, dependencies, and scaling.

### Setup

The first integration step is to add the Supaworker schema to your Supabase project.

```bash
supabase migration new setup_supaworker
```

Carefully review and add the following SQL from [here](./supabase/migrations/20250524033517_setup_supaworker.sql).

Run the migration:

```bash
supabase migration up --local
```

Update your `supabase/config.toml` to include the `supaworker` schema:

```toml
[api]
schemas = ["public", "supaworker"]
```

Sync the schema to your Supabase project:

```bash
supabase db lint
supabase test db
supabase db push
```

Add [`supaworker-js`](https://www.npmjs.com/package/supaworker-js) to your project:

```bash
npm install --save supaworker-js
```

### Examples

See the [examples](./examples) directory for more.

#### Node.js

Create a new project

```bash
mkdir my-worker && cd my-worker
npm init -y
npm install --save supaworker-js
touch index.js
```

Edit package.json to use ESM modules:

```json
{
  "type": "module"
}
```

Basic node example (see [examples/node](./examples/node)):

```js
import { createClient } from '@supabase/supabase-js';
import { enqueueJobs, startWorkers, stopWorkers, Supaworker } from 'supaworker-js';

const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  db: {
    schema: 'supaworker',
  },
});

const worker = new Supaworker(
  client,
  {
    queue: 'example',
  },
  async (job) => {
    console.log('Working on a job with message:', job.payload.message);
  },
);

const [job] = await enqueueJobs(client, [
  {
    queue: 'example',
    payload: { message: 'Hello via Node!' },
  },
]);

console.log('Job enqueued:', job.id);

await startWorkers([worker]);

process.exit(0);
```

Run the worker:

```bash
SUPABASE_URL="" \
SUPABASE_SERVICE_ROLE_KEY="" \
node index.js
```
