import { afterEach, describe, expect, test } from 'bun:test';
import { SupaworkerClientOptions, createSupaworkerClient } from '../src/client';
import { createSupaworker } from '../src/worker';

const options: SupaworkerClientOptions = {
  supabase_url: 'http://localhost:56781',
  supabase_service_role_key: import.meta.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
};

afterEach(async () => {
  const { client } = createSupaworkerClient(options);
  await client.from('jobs').delete().not('id', 'is', null);
  await client.from('logs').delete().not('id', 'is', null);
});

describe('createSupaworker', () => {
  test('should return a worker', () => {
    const worker = createSupaworker(options, { queue: 'test' }, async () => {});
    expect(worker).toBeDefined();
    expect(worker.start).toBeDefined();
    expect(worker.stop).toBeDefined();
  });
});

describe('Supaworker', () => {
  test('should process a job', async () => {
    const { client, enqueue } = createSupaworkerClient(options);
    const jobs = await enqueue([{ queue: 'test' }]);
    const confirm = async () => {
      const { data } = await client
        .from('jobs')
        .select('id')
        .eq('id', jobs!.at(0)!.id)
        .maybeSingle();
      return data;
    };
    const worker = createSupaworker(options, { queue: 'test' }, async (job) => {
      expect(job.id).toBe(jobs!.at(0)!.id);
    });
    const pending = await confirm();
    expect(pending).not.toBeNull();
    setTimeout(async () => {
      await worker.stop();
      const completed = await confirm();
      expect(completed).toBeNull();
    }, 500);
    await worker.start();
  });
});
