import 'dotenv/config';

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

    // Normally, you would let this worker continue indefinitely.
    // In this example, we stop the worker after processing the first job.
    await stopWorkers([worker]);
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
