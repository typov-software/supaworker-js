import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from './database.types';

export type Job = Database['supaworker']['Tables']['jobs']['Row'];
export type JobInsert = Database['supaworker']['Tables']['jobs']['Insert'];
export type JobUpdate = Database['supaworker']['Tables']['jobs']['Update'];

export type JobWithPayload<T> = Job & { payload: T };
export type JobWithPayloadInsert<T> = Omit<JobInsert, 'status'> & { payload: T };

export const JOB_STATUS = {
  PENDING: 'PENDING',
  SUCCESS: 'SUCCESS',
  ERROR: 'ERROR',
  RETRY: 'RETRY',
} as const;

export type JobStatus = (typeof JOB_STATUS)[keyof typeof JOB_STATUS];

export async function enqueueJobs<T>(
  client: SupabaseClient<Database>,
  jobs: JobWithPayloadInsert<T>[],
): Promise<JobWithPayload<T>[]> {
  const { data } = await client
    .from('jobs')
    .insert(jobs.map(({ id: _, ...job }) => ({ ...job, status: JOB_STATUS.PENDING })))
    .select()
    .throwOnError();
  return data as JobWithPayload<T>[];
}
