import { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
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
}

/**
 * A function that handles a job.
 */
export type SupaworkerHandler = <Payload>(job: SupaworkerJob<Payload>) => Promise<void>;

/**
 * A worker that processes jobs from a queue.
 */
export class Supaworker<Payload> {
  private channel: RealtimeChannel | null = null;
  private hasWork = false;
  private working = false;

  constructor(
    private client: SupabaseClient<Database, 'supaworker'>,
    private enqueue: EnqueueFunction<Payload>,
    private work: SupaworkerHandler,
    private options: SupaworkerOptions,
  ) {}

  /**
   * Remove a job from the queue to do work on.
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
        () => {
          // Signal that there is work to be done.
          this.hasWork = true;
        },
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
    console.debug(`Starting work on supaworker: ${this.options.queue}`);
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
    console.debug(`Stopping work on supaworker: ${this.options.queue}`);
    await this.unsubscribe();
    this.working = false;
  }
}

/**
 * Create a new worker to work on a queue.
 */
export function createSupaworker(
  clientOptions: SupaworkerClientOptions,
  options: SupaworkerOptions,
  work: SupaworkerHandler,
) {
  const { client, enqueue } = createSupaworkerClient(clientOptions);
  return new Supaworker(client, enqueue, work, options);
}
