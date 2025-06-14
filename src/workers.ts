import {
  REALTIME_SUBSCRIBE_STATES,
  type RealtimeChannel,
  type SupabaseClient,
} from '@supabase/supabase-js';

import type { Database } from './database.types';
import { JOB_STATUS, type JobStatus, type JobWithPayload } from './jobs';
import { type Log, LOG_STATUS, type LogStatus } from './logs';

const colors = {
  info: '\x1b[34m', // blue
  warn: '\x1b[33m', // yellow
  error: '\x1b[31m', // red
  debug: '\x1b[36m', // cyan
};

export async function startWorkers<T>(workers: Supaworker<T>[]) {
  await Promise.allSettled(workers.map((worker) => worker.start()));
}

export async function stopWorkers<T>(workers: Supaworker<T>[]) {
  await Promise.allSettled(workers.map((worker) => worker.stop()));
}

export type SupaworkerHandler<T> = (job: JobWithPayload<T>) => Promise<void>;

export interface SupaworkerOptions {
  queue: string;
  concurrency?: number;
  max_attempts?: number;
  max_ticks?: number;
  tick_interval_ms?: number;
  realtime_subscribe_retries?: number;
}

export class Supaworker<T> {
  public readonly id = Math.random().toString(36).substring(2, 15);

  // Initialized in constructor
  private client: SupabaseClient<Database>;
  private handler: SupaworkerHandler<T>;
  private options: Required<SupaworkerOptions>;

  // Worker state
  private channel: RealtimeChannel | null = null;
  private hasWork = false;
  private jobCount = 0;
  private isWorking = false;
  private ticks = 0;
  private realtime_subscribe_retries = 0;

  constructor(
    client: SupabaseClient<Database>,
    options: SupaworkerOptions,
    handler: SupaworkerHandler<T>,
  ) {
    // Validate options
    if (options.concurrency !== undefined && options.concurrency < 1) {
      throw new Error('Concurrency must be at least 1');
    }
    if (options.max_attempts !== undefined && options.max_attempts < 1) {
      throw new Error('Max attempts must be at least 1');
    }
    if (options.max_ticks !== undefined && options.max_ticks < 0) {
      throw new Error('Max ticks must be at least 0');
    }
    if (options.max_ticks === 0) {
      this.console(
        'warn',
        'Max ticks is 0, worker will never check for work and relies on realtime events only.',
      );
    }
    if (
      options.realtime_subscribe_retries !== undefined &&
      options.realtime_subscribe_retries < 0
    ) {
      throw new Error('Realtime subscribe retries must be at least 0');
    }
    if (options.tick_interval_ms !== undefined && options.tick_interval_ms < 100) {
      throw new Error('Tick interval must be at least 100ms');
    }

    this.client = client;
    this.options = {
      concurrency: 1,
      max_attempts: 3,
      max_ticks: 60,
      tick_interval_ms: 1000,
      realtime_subscribe_retries: 3,
      ...options,
    };
    this.handler = handler;
  }

  async stop() {
    await this.unsubscribe();
    this.isWorking = false;
  }

  async start() {
    this.console('info', 'Starting worker...');
    await this.subscribe();
    try {
      await this.work();
    } finally {
      await this.stop();
      this.console('warn', 'Worker stopped.');
    }
  }

  private console(level: 'info' | 'warn' | 'error' | 'debug', ...args: unknown[]) {
    if (process.env.NODE_ENV === 'test') return;
    if (process.env.NODE_ENV === 'development') {
      console[level](`${colors[level]}${this.options.queue}\x1b[0m.${this.id}`, ...args);
    } else {
      console[level](`${this.options.queue}.${this.id}`, ...args);
    }
  }

  private async sleep(ms?: number) {
    await new Promise((resolve) => setTimeout(resolve, ms ?? this.options.tick_interval_ms));
  }

  private async tick() {
    await this.sleep();
    this.ticks++;
  }

  private async saveLog(status: LogStatus, job: JobWithPayload<T>, error?: Error): Promise<Log> {
    const { data } = await this.client
      .from('logs')
      .insert({
        job_id: job.id,
        status: status,
        error: error ? { message: error.message, stack: error.stack } : null,
      })
      .throwOnError()
      .select()
      .single<Log>();
    if (!data) {
      throw new Error('Failed to create log');
    }
    return data as Log;
  }

  private async unsubscribe() {
    if (this.channel) {
      const result = await this.channel.unsubscribe();
      this.channel = null;
      return result;
    }
    return null;
  }

  private async subscribe(): Promise<void> {
    try {
      await this.unsubscribe();
      this.channel = this.client
        .channel(`jobs:${this.options.queue}`)
        .on(
          'postgres_changes',
          {
            schema: 'supaworker',
            table: 'jobs',
            event: 'INSERT',
            filter: `queue=eq.${this.options.queue}`,
          },
          () => {
            this.console('debug', 'Realtime event received. Checking for work...');
            this.hasWork = true;
          },
        )
        .subscribe(async (status, err) => {
          if (err) {
            this.console('error', 'Error subscribing to channel', err);
          }
          switch (status) {
            case REALTIME_SUBSCRIBE_STATES.SUBSCRIBED:
              this.console('debug', 'Subscribed to channel');
              break;
            case REALTIME_SUBSCRIBE_STATES.CLOSED:
              this.console('debug', 'Channel closed, worker is stopped or stopping...');
              this.isWorking = false;
              break;
            case REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR:
              this.console('error', 'Channel error', err);
              break;
            case REALTIME_SUBSCRIBE_STATES.TIMED_OUT:
              this.console('error', 'Channel timed out');
              await this.retrySubscription();
              break;
          }
        });
    } catch (error) {
      await this.retrySubscription();
      throw error;
    }
  }

  private async retrySubscription(): Promise<void> {
    if (this.options.realtime_subscribe_retries > this.realtime_subscribe_retries) {
      this.console(
        'warn',
        `Subscription failed, retrying... (${this.options.realtime_subscribe_retries - this.realtime_subscribe_retries} attempts left)`,
      );
      await this.sleep(1000);
      this.realtime_subscribe_retries++;
      return this.subscribe();
    }
  }

  private async work() {
    try {
      this.console('debug', 'Starting work loop...');

      this.hasWork = true;
      this.isWorking = true;

      while (this.isWorking) {
        if (this.jobCount > this.options.concurrency) {
          this.console('debug', 'Max concurrency reached. Sleeping...');
          await this.sleep();
          continue;
        }

        if (this.options.max_ticks !== 0 && this.ticks >= this.options.max_ticks) {
          this.console(
            'debug',
            `Max ticks reached after ${(this.ticks * this.options.tick_interval_ms).toLocaleString()}ms. Manually checking for work...`,
          );
          this.hasWork = true;
        }

        if (!this.hasWork) {
          await this.tick();
          continue;
        }

        this.ticks = 0;
        const job = await this.dequeue();
        if (job) {
          this.workOnJob(job);
        } else {
          this.hasWork = false;
        }
      }

      this.console('debug', 'Work loop ended.');
    } catch (error) {
      this.console('error', 'Fatal error in work loop', error);
      await this.stop();
    }
  }

  private async dequeue(): Promise<JobWithPayload<T> | null> {
    const { data, error } = await this.client
      .rpc('dequeue', { queue_name: this.options.queue })
      .select()
      .maybeSingle<JobWithPayload<T>>();
    if (error) {
      this.console('error', 'Error dequeuing job', error);
      return null;
    }
    return data ? (data as JobWithPayload<T>) : null;
  }

  private async incrementAttempts(job: JobWithPayload<T>) {
    const { data, error } = await this.client
      .from('jobs')
      .update({ attempts: job.attempts + 1 })
      .eq('id', job.id)
      .select()
      .single<JobWithPayload<T>>();
    if (error) {
      this.console('error', 'Error incrementing attempts', error);
      throw error;
    }
    return data as JobWithPayload<T>;
  }

  private async updateJobStatus(job: JobWithPayload<T>, status: JobStatus) {
    const { data, error } = await this.client
      .from('jobs')
      .update({ status })
      .eq('id', job.id)
      .select()
      .single<JobWithPayload<T>>();
    if (error || !data) {
      this.console('error', 'Error updating job status', error);
      throw error;
    }
    return data as JobWithPayload<T>;
  }

  private async workOnJob(job: JobWithPayload<T>): Promise<void> {
    try {
      this.jobCount++;
      this.console('debug', 'Working on job:', job.id);
      job = await this.incrementAttempts(job);
      await this.handler(job);
      await this.saveLog(LOG_STATUS.SUCCESS, job);
      job = await this.updateJobStatus(job, JOB_STATUS.SUCCESS);
      this.console('debug', 'Job completed successfully.', job.id);
    } catch (error) {
      if (job.attempts >= this.options.max_attempts) {
        this.console('error', 'Job failed after max attempts.', error);
        await this.saveLog(LOG_STATUS.ERROR, job, error as Error);
        job = await this.updateJobStatus(job, JOB_STATUS.ERROR);
        return;
      }

      this.console('debug', 'Job failed. Retrying...');
      job = await this.updateJobStatus(job, JOB_STATUS.RETRY);
      await this.saveLog(LOG_STATUS.RETRY, job);
      // Don't await this, it will block the worker from processing other jobs
      this.workOnJob(job).catch((error) => {
        this.console('error', 'Error retrying', error);
      });
    } finally {
      this.jobCount = Math.max(0, this.jobCount - 1);
    }
  }
}
