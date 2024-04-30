import { SupabaseClient, createClient, SupabaseClientOptions } from '@supabase/supabase-js';
import { Database, Json } from './database.types';

/**
 * Individual jobs can have custom options that workers can use to override default behavior.
 */
export interface SupaworkerJobOptions {
  /**
   * The number of attempts to make on a job before marking it as failed.
   */
  max_attempts?: number;
}

/**
 * A job in the Supaworker system.
 */
export interface SupaworkerJob<Payload> {
  /**
   * Auto-incrementing ID.
   */
  id: number;
  /**
   * The time the job was created.
   */
  created_at: string;
  /**
   * Disabled jobs will not be processed.
   */
  enabled: boolean;
  /**
   * The number of times the job has been attempted.
   */
  attempts: number;
  /**
   * The name of the queue this job belongs to.
   */
  queue: string;
  /**
   * Supaworker JSON options for this job.
   */
  options: SupaworkerJobOptions | null;
  /**
   * JSON payload for this job.
   */
  payload: Payload | null;
}

/**
 * Shared connection options for Supaworker clients.
 */
export interface SupaworkerClientOptions {
  /**
   * The Supabase URL.
   */
  supabase_url: string;
  /**
   * The Supabase service role key.
   * Supaworker jobs should not be accessible by the typical `anon` or `authenticated` roles.
   * See: https://supabase.com/docs/guides/api/api-keys#the-servicerole-key
   */
  supabase_service_role_key: string;
  /**
   * Supabase client options to pass to the Supabase client.
   */
  supabase_options?: SupabaseClientOptions<'supaworker'>;
}

export function createSupaworkerClient<Payload>({
  supabase_url,
  supabase_service_role_key,
  supabase_options,
}: SupaworkerClientOptions): {
  client: SupabaseClient<Database, 'supaworker'>;
  enqueue: (job: SupaworkerJob<Payload>) => Promise<unknown>;
} {
  const client = createClient<Database>(supabase_url, supabase_service_role_key, {
    ...supabase_options,
    db: {
      ...supabase_options?.db,
      schema: 'supaworker',
    },
  });
  return {
    client,
    enqueue: async (job: SupaworkerJob<Payload>) => {
      return await client.from('jobs').insert({
        ...job,
        options: job.options as Json,
        payload: job.payload as Json,
      });
    },
  };
}
