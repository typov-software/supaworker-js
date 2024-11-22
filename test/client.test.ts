import { afterAll, describe, expect, test } from 'bun:test';

import { createSupaworkerClient, SupaworkerClientOptions } from '../src/client';

const options: SupaworkerClientOptions = {
  supabase_url: 'http://localhost:56781',
  supabase_service_role_key: import.meta.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
};

afterAll(async () => {
  const { client } = createSupaworkerClient(options);
  await client.from('jobs').delete().not('id', 'is', null);
  await client.from('logs').delete().not('id', 'is', null);
});

describe('createSupaworkerClient', () => {
  test('should return a client and enqueue function', () => {
    const { client, enqueue } = createSupaworkerClient(options);
    expect(client).toBeDefined();
    expect(enqueue).toBeDefined();
  });

  test('client should have the correct schema', async () => {
    const { client } = createSupaworkerClient(options);
    const { data, error } = await client.from('jobs').select('*');
    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data).toBeInstanceOf(Array);
    expect(data).toHaveLength(0);
  });

  test('enqueue should insert a job', async () => {
    const { enqueue } = createSupaworkerClient(options);
    const jobs = await enqueue([
      {
        queue: 'test',
        options: null,
        payload: null,
      },
    ]);
    expect(jobs).toBeDefined();
    expect(jobs).toBeInstanceOf(Array);
    expect(jobs).toHaveLength(1);
  });
});
