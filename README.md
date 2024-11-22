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

Carefully review and add the following SQL from [here](./supabase/migrations/20240407025302_setup_supaworker.sql).

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

Basic javascript example:

```js
import { createSupaworker } from 'supaworker-js';

const clientOptions = {
  supabase_url: process.env.SUPABASE_URL ?? '',
  supabase_service_role_key: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
};

const workerOptions = {
  queue: 'example',
};

const { enqueue, worker } = createSupaworker(clientOptions, workerOptions, async (job) => {
  console.log(job.payload.message);
});

await enqueue([
  {
    queue: 'example',
    payload: {
      message: 'Hello, World!',
    },
  },
]);

process.on('SIGINT', async () => {
  await worker.stop();
  process.exit();
});

await worker.start();
await worker.stop();
```

Run the worker:

```bash
SUPABASE_URL="" \
SUPABASE_SERVICE_ROLE_KEY="" \
node index.js
```

#### Bun

Create a new project

```bash
mkdir my-worker && cd my-worker
bun init
bun add supaworker-js
```

Basic typescript example:

```ts
import {
  createSupaworker,
  type SupaworkerClientOptions,
  type SupaworkerOptions,
} from 'supaworker-js';

const clientOptions: SupaworkerClientOptions = {
  supabase_url: import.meta.env.SUPABASE_URL ?? '',
  supabase_service_role_key: import.meta.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
};

const workerOptions: SupaworkerOptions = {
  queue: 'example',
};

const { enqueue, worker } = createSupaworker<{ message: string }>(
  clientOptions,
  workerOptions,
  async (job) => {
    console.log(job.payload!.message);
  },
);

await enqueue([
  {
    queue: 'example',
    payload: {
      message: 'Hello, World!',
    },
  },
]);

process.on('SIGINT', async () => {
  await worker.stop();
  process.exit();
});

await worker.start();
await worker.stop();
```

Run the worker:

```bash
SUPABASE_URL="" \
SUPABASE_SERVICE_ROLE_KEY="" \
bun run index.ts
```
