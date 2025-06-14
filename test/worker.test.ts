import { createClient } from '@supabase/supabase-js';
import { describe, expect, test } from 'bun:test';

import { Database } from '../src/database.types';
import { enqueueJobs, JOB_STATUS } from '../src/jobs';
import { LOG_STATUS } from '../src/logs';
import { Supaworker } from '../src/workers';

interface TestPayload {
  message: string;
}

const client = createClient<Database>(
  import.meta.env.SUPABASE_URL ?? 'http://localhost:56781',
  import.meta.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  {
    db: {
      schema: 'supaworker',
    },
  },
);

describe('Supaworker', () => {
  test('should process a job', async (done) => {
    await enqueueJobs<TestPayload>(client, [{ queue: 'test', payload: { message: 'test' } }]);
    const worker = new Supaworker<TestPayload>(client, { queue: 'test' }, async (job) => {
      expect(job).toBeDefined();
      expect(job.payload).toBeDefined();
      expect(job.payload.message).toBe('test');
      await worker.stop();
      done();
    });
    worker.start();
  });

  test('should process multiple jobs', async (done) => {
    await enqueueJobs<TestPayload>(client, [
      { queue: 'test', payload: { message: 'a' } },
      { queue: 'test', payload: { message: 'b' } },
      { queue: 'test', payload: { message: 'c' } },
    ]);
    const worker = new Supaworker<TestPayload>(
      client,
      { queue: 'test', tick_interval_ms: 100 },
      async (job) => {
        expect(job).toBeDefined();
        expect(job.payload).toBeDefined();
        if (job.payload.message === 'c') {
          await worker.stop();
          done();
        }
      },
    );
    worker.start();
  });

  test('should process incoming jobs', async (done) => {
    const worker = new Supaworker<TestPayload>(
      client,
      { queue: 'test', tick_interval_ms: 100 },
      async (job) => {
        expect(job).toBeDefined();
        expect(job.payload).toBeDefined();
        await worker.stop();
        done();
      },
    );
    worker.start();
    await enqueueJobs<TestPayload>(client, [{ queue: 'test', payload: { message: 'test' } }]);
  });

  test('should retry failed jobs', async (done) => {
    const worker = new Supaworker<TestPayload>(
      client,
      { queue: 'test', max_attempts: 2 },
      async (job) => {
        if (job.attempts < 2) {
          expect(job.attempts).toBe(1);
          expect(job.status).toBe('PENDING');
          throw new Error('Test error');
        }
        expect(job).toBeDefined();
        expect(job.payload).toBeDefined();
        expect(job.attempts).toBe(2);
        expect(job.status).toBe('RETRY');
        await worker.stop();
        done();
      },
    );
    await enqueueJobs<TestPayload>(client, [{ queue: 'test', payload: { message: 'test' } }]);
    worker.start();
  });

  test('should retry failed jobs up to the maximum attempts', async (done) => {
    const worker = new Supaworker<TestPayload>(
      client,
      { queue: 'test', max_attempts: 3 },
      async (job) => {
        if (job.attempts < 3) {
          expect(job.attempts).toBeLessThan(3);
          throw new Error('Test error');
        }
        expect(job).toBeDefined();
        expect(job.payload).toBeDefined();
        expect(job.attempts).toBe(3);
        expect(job.status).toBe(JOB_STATUS.RETRY);
        await worker.stop();
        done();
      },
    );
    await enqueueJobs<TestPayload>(client, [{ queue: 'test', payload: { message: 'test' } }]);
    worker.start();
  });

  test('should log successful jobs', async () => {
    const worker = new Supaworker<TestPayload>(client, { queue: 'test' }, async (job) => {
      expect(job).toBeDefined();
      expect(job.payload).toBeDefined();
      await worker.stop();
    });
    const jobs = await enqueueJobs<TestPayload>(client, [
      { queue: 'test', payload: { message: 'test' } },
    ]);
    await worker.start();
    const { data } = await client
      .from('logs')
      .select()
      .eq('job_id', jobs[0].id)
      .single()
      .throwOnError();
    expect(data.status).toBe(LOG_STATUS.SUCCESS);
    const { data: job } = await client
      .from('jobs')
      .select()
      .eq('id', jobs[0].id)
      .single()
      .throwOnError();
    expect(job.status).toBe(JOB_STATUS.SUCCESS);
  });

  test('should log retries and failed jobs', async () => {
    const worker = new Supaworker<TestPayload>(
      client,
      { queue: 'test', max_attempts: 3 },
      async (job) => {
        expect(job).toBeDefined();
        expect(job.payload).toBeDefined();
        throw new Error('Test error');
      },
    );
    const jobs = await enqueueJobs<TestPayload>(client, [
      { queue: 'test', payload: { message: 'test' } },
    ]);
    worker.start();
    await new Promise((resolve) => setTimeout(resolve, 500));
    const { data: logs } = await client
      .from('logs')
      .select()
      .eq('job_id', jobs[0].id)
      .throwOnError();
    expect(logs.some((log) => log.status === LOG_STATUS.RETRY)).toBe(true);
    expect(logs.some((log) => log.status === LOG_STATUS.ERROR)).toBe(true);
    const { data: job } = await client
      .from('jobs')
      .select()
      .eq('id', jobs[0].id)
      .single()
      .throwOnError();
    expect(job.status).toBe(JOB_STATUS.ERROR);
  });
});
