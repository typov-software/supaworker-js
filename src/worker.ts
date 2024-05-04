import {
  RealtimeChannel,
  RealtimePostgresInsertPayload,
  RealtimePostgresUpdatePayload,
  SupabaseClient,
} from '@supabase/supabase-js';
import {
  EnqueueFunction,
  SupaworkerClientOptions,
  SupaworkerJob,
  createSupaworkerClient,
} from './client';
import { Database, Json } from './database.types';

/**
 * Options for a Supaworker.
 */
export interface SupaworkerOptions {
  /**
   * The name of the queue to work on.
   */
  queue: string;
  /**
   * The number of milliseconds to wait between polling for new jobs.
   */
  sleep_ms?: number;
  /**
   * The number of attempts to make on a job before marking it as failed. Job options take precedence over this.
   */
  max_attempts?: number;
  /**
   * Enable logging of job outcomes. Defaults to `false`.
   */
  enable_logs?: boolean;
  /**
   * Enable debug mode. Defaults to `false`.
   */
  debug?: boolean;
}

/**
 * A function that handles a job.
 */
export type SupaworkerHandler<Payload> = (job: SupaworkerJob<Payload>) => Promise<void>;

/**
 * A worker that processes jobs from a queue. Use `createSupaworker` to create a new worker.
 */
export class Supaworker<Payload> {
  private channel: RealtimeChannel | null = null;
  private hasWork = false;
  private working = false;

  constructor(
    private client: SupabaseClient<Database, 'supaworker'>,
    private enqueue: EnqueueFunction<Payload>,
    private work: SupaworkerHandler<Payload>,
    private options: SupaworkerOptions,
  ) {}

  /**
   * Remove a job from the queue to do work on.
   * @param queue_name The name of the queue to get jobs from
   */
  private async dequeue(queue_name: string): Promise<SupaworkerJob<Payload> | null> {
    const { data: job, error } = await this.client.rpc('dequeue', { queue_name }).maybeSingle();
    if (error) console.error('Error dequeuing job:', error);
    return (job as SupaworkerJob<Payload>) ?? null;
  }

  /**
   * Logs the outcome of a job.
   * @param status Job completion status
   * @param job The original job
   * @returns supbase insert response
   */
  private async log(status: 'success' | 'failure' | 'retry', job: SupaworkerJob<Payload>) {
    if (!this.options.enable_logs) return;
    return await this.client.from('logs').insert({
      status,
      job: job as unknown as Json,
    });
  }

  /**
   * Subscribe to the realtime queue to listen for new jobs.
   */
  private subscribe() {
    const onJobChange = (
      payload:
        | RealtimePostgresInsertPayload<SupaworkerJob<unknown>>
        | RealtimePostgresUpdatePayload<SupaworkerJob<unknown>>,
    ) => {
      // If the job is disabled, we don't need to do anything.
      if (payload.new.enabled === false) return;
      // Signal that there is work to be done.
      this.hasWork = true;
    };
    // Listen for new jobs on the queue.
    this.channel = this.client
      .channel('jobs')
      .on(
        'postgres_changes',
        {
          schema: 'supaworker',
          table: 'jobs',
          event: 'INSERT',
          filter: `queue=eq.${this.options.queue}`,
        },
        onJobChange,
      )
      .on(
        'postgres_changes',
        {
          schema: 'supaworker',
          table: 'jobs',
          event: 'UPDATE',
          filter: `queue=eq.${this.options.queue}`,
        },
        onJobChange,
      )
      .subscribe();
  }

  /**
   * Unsubscribe from the realtime queue.
   */
  private async unsubscribe() {
    await this.channel?.unsubscribe();
  }

  /**
   * Start working on the queue.
   */
  async start() {
    if (this.options.debug) console.log(`Starting work on queue: ${this.options.queue}`);
    await this.subscribe();

    // Start working on the queue.
    this.hasWork = true;
    this.working = true;

    while (this.working) {
      // Wait for work to be available.
      if (!this.hasWork) {
        // Check if we have work once a `sleep_ms` interval.
        await new Promise((resolve) => setTimeout(resolve, this.options.sleep_ms ?? 3_000));
        continue;
      }

      // Get a job from the queue.
      const job = await this.dequeue(this.options.queue);
      if (job) {
        // Ensure we check for another job immediately after this one
        this.hasWork = true;
        job.attempts = (job.attempts ?? 0) + 1;
        try {
          // Work on the job.
          await this.work(job);
          await this.log('success', job);
        } catch (workError) {
          console.error('Error working on job:', workError);
          const allowedAttempts = job.options?.max_attempts ?? this.options.max_attempts ?? 1;
          if (job.attempts < allowedAttempts) {
            await this.enqueue([job]);
            await this.log('retry', job);
          } else {
            await this.log('failure', job);
          }
        }
      } else {
        // No job was dequeued, so we can stop looking for work.
        this.hasWork = false;
      }
    }
  }

  /**
   * Stop working on the queue.
   */
  async stop() {
    if (this.options.debug) console.log(`Stopping work on queue: ${this.options.queue}`);
    await this.unsubscribe();
    this.working = false;
  }
}

/**
 * Create a new worker to work on a queue.
 * @param clientOptions Options for the Supabase client.
 * @param workerOptions Options for the worker.
 * @param work The function to run on each job.
 * @returns The client, enqueue function, and worker.
 */
export function createSupaworker<Payload = unknown>(
  clientOptions: SupaworkerClientOptions,
  workerOptions: SupaworkerOptions,
  work: SupaworkerHandler<Payload>,
) {
  const { client, enqueue } = createSupaworkerClient<Payload>(clientOptions);
  const worker = new Supaworker<Payload>(client, enqueue, work, workerOptions);
  return { client, enqueue, worker };
}
