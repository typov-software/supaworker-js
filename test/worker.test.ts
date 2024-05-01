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
