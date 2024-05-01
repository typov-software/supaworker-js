import { describe, expect, test } from 'bun:test';
import { createSupaworkerClient } from '../src/client';

describe('createSupaworkerClient', () => {
  test('should return a client and enqueue function', () => {
    const { client, enqueue } = createSupaworkerClient({
      supabase_url: 'http://localhost:56781',
      supabase_service_role_key: import.meta.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    });
    expect(client).toBeDefined();
    expect(enqueue).toBeDefined();
  });
});
