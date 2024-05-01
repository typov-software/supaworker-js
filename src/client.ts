import { SupabaseClient, createClient, SupabaseClientOptions } from '@supabase/supabase-js';
import { Database } from './database.types';

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
 * Type for inserting a new Supaworker job. Alias the `Insert` type for the `jobs` table.
 */
export type SupaworkerJobInsert = Database['supaworker']['Tables']['jobs']['Insert'];

/**
 * Options for creating a new Supaworker job.
 */
export interface SupaworkerEnqueueJobOptions<Payload> {
  /**
   * The name of the queue this job belongs to.
   */
  queue: string;
  /**
   * Supaworker JSON options for this job.
   */
  options?: SupaworkerJobOptions | null;
  /**
   * JSON payload for this job.
   */
  payload?: Payload | null;
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

/**
 * A function to enqueue jobs in the Supaworker system.
 */
export type EnqueueFunction<Payload> = (
  jobs: SupaworkerEnqueueJobOptions<Payload>[],
) => Promise<SupaworkerJob<Payload>[] | null>;

/**
 * Create a Supaworker client and enqueuing function.
 * @param options Client options for the Supaworker client.
 * @returns A supabase client and a function to enqueue jobs.
 */
export function createSupaworkerClient<Payload>(options: SupaworkerClientOptions): {
  client: SupabaseClient<Database, 'supaworker'>;
  enqueue: EnqueueFunction<Payload>;
} {
  const { supabase_url, supabase_service_role_key, supabase_options } = options;
  // Create a Supabase client with the `supaworker` schema.
  const client = createClient<Database>(supabase_url, supabase_service_role_key, {
    ...supabase_options,
    db: {
      ...supabase_options?.db,
      schema: 'supaworker',
    },
  });
  // Create a function to enqueue jobs.
  const enqueue = async (jobs: SupaworkerEnqueueJobOptions<Payload>[]) => {
    const { data, error } = await client
      .from('jobs')
      .insert(jobs as SupaworkerJobInsert[])
      .select('*');
    if (error) throw error;
    return data as SupaworkerJob<Payload>[] | null;
  };
  return {
    client,
    enqueue,
  };
}
