import { describe, expect, test } from 'bun:test';
import { SupaworkerClientOptions, createSupaworkerClient } from '../src/client';

const options: SupaworkerClientOptions = {
  supabase_url: 'http://localhost:56781',
  supabase_service_role_key: import.meta.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
};

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
});
