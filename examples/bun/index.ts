import { createClient } from '@supabase/supabase-js';
import {
  enqueueJobs,
  startWorkers,
  stopWorkers,
  Supaworker,
  type SupaworkerDatabase,
} from 'supaworker-js';

const client = createClient<SupaworkerDatabase>(
  import.meta.env.SUPABASE_URL ?? 'http://localhost:56781',
  import.meta.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  {
    db: {
      schema: 'supaworker',
    },
  },
);

interface ExamplePayload {
  message: string;
}

const worker = new Supaworker<ExamplePayload>(
  client,
  {
    queue: 'example',
  },
  async (job) => {
    console.log('Working on a job with message:', job.payload.message);

    // Normally, you would let this worker continue indefinitely.
    // In this example, we stop the worker after processing the first job.
    await stopWorkers([worker]);
  },
);

const [job] = await enqueueJobs<ExamplePayload>(client, [
  {
    queue: 'example',
    payload: { message: 'Hello via Bun!' },
  },
]);

console.log('Job enqueued:', job!.id);

await startWorkers([worker]);

process.exit(0);
