import { afterEach, describe, expect, test } from 'bun:test';
import { SupaworkerClientOptions, createSupaworkerClient } from '../src/client';
import { Supaworker, SupaworkerOptions, createSupaworker } from '../src/worker';

const clientOptions: SupaworkerClientOptions = {
  supabase_url: 'http://localhost:56781',
  supabase_service_role_key: import.meta.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
};

const workerOptions: SupaworkerOptions = {
  queue: 'test',
  sleep_ms: 100,
};

afterEach(async () => {
  const { client } = createSupaworkerClient(clientOptions);
  await client.from('jobs').delete().not('id', 'is', null);
  await client.from('logs').delete().not('id', 'is', null);
});

describe('createSupaworker', () => {
  test('should return a worker', () => {
    const { worker } = createSupaworker<{ message: string }>(
      clientOptions,
      workerOptions,
      async (job) => {
        // Type check
        expect(job).toBeDefined();
        expect(job.payload).toBeDefined();
        expect(job.payload?.message).toBeDefined();
      },
    );
    expect(worker).toBeDefined();
    expect(worker.start).toBeDefined();
    expect(worker.stop).toBeDefined();
  });
});

describe('Supaworker', () => {
  let worker: Supaworker<unknown>;

  afterEach(async () => {
    await worker.stop();
  });

  test('should process a job', async () => {
    const supaworker = createSupaworker(clientOptions, workerOptions, async (job) => {
      expect(job.id).toBe(jobs!.at(0)!.id);
    });
    worker = supaworker.worker;
    const jobs = await supaworker.enqueue([{ queue: 'test' }]);
    const confirm = async () => {
      const { data } = await supaworker.client
        .from('jobs')
        .select('id')
        .eq('id', jobs!.at(0)!.id)
        .maybeSingle();
      return data;
    };
    const pending = await confirm();
    expect(pending).not.toBeNull();
    setTimeout(async () => {
      await worker.stop();
      const completed = await confirm();
      expect(completed).toBeNull();
    }, 500);
    await worker.start();
  });

  test('should process multiple jobs', async () => {
    const supaworker = createSupaworker(clientOptions, workerOptions, async (job) => {
      expect(jobs!.map((job) => job.id)).toContain(job.id);
    });
    worker = supaworker.worker;
    const jobs = await supaworker.enqueue([
      { queue: 'test' },
      { queue: 'test' },
      { queue: 'test' },
    ]);
    const confirm = async () => {
      const { data } = await supaworker.client
        .from('jobs')
        .select('id')
        .in(
          'id',
          jobs!.map((job) => job.id),
        );
      return data;
    };
    const pending = await confirm();
    expect(pending).toHaveLength(3);
    setTimeout(async () => {
      await worker.stop();
      const completed = await confirm();
      expect(completed).toHaveLength(0);
    }, 1000);
    await worker.start();
  });

  test('should process incoming jobs', async () => {
    const supaworker = createSupaworker(clientOptions, workerOptions, async (job) => {
      // Expect a job to have been enqueued.
      expect(job).toBeDefined();
    });
    worker = supaworker.worker;
    // Start the worker and enqueue a job after 500ms.
    setTimeout(async () => {
      await supaworker.enqueue([{ queue: 'test' }]);
      // Stop the worker 500ms later.
      setTimeout(() => worker.stop(), 500);
    }, 500);
    // Start with no jobs.
    const confirm = async () => {
      const { data } = await supaworker.client.from('jobs').select('id').eq('queue', 'test');
      expect(data).toHaveLength(0);
    };
    await confirm();
    await worker.start();
    await confirm();
  });

  test('should ignore disabled jobs', async () => {
    const supaworker = createSupaworker(clientOptions, workerOptions, async () => {
      expect(true).toBe(false);
    });
    worker = supaworker.worker;
    await supaworker.enqueue([{ queue: 'test', enabled: false }]);
    setTimeout(() => worker.stop(), 500);
    await worker.start();
    const { data } = await supaworker.client.from('jobs').select('id').eq('queue', 'test');
    expect(data).toHaveLength(1);
  });

  test('should process newly enabled jobs', async () => {
    const supaworker = createSupaworker(clientOptions, workerOptions, async (job) => {
      expect(job.enabled).toBe(true);
    });
    worker = supaworker.worker;
    const jobs = await supaworker.enqueue([{ queue: 'test', enabled: false }]);

    // Enable the job after the worker has started.
    setTimeout(async () => {
      const { data } = await supaworker.client.from('jobs').select('id').eq('queue', 'test');
      expect(data).toHaveLength(1);
      await supaworker.client.from('jobs').update({ enabled: true }).eq('id', jobs!.at(0)!.id);
      setTimeout(() => worker.stop(), 500);
    }, 500);

    await worker.start();
    const { data } = await supaworker.client.from('jobs').select('id').eq('queue', 'test');
    expect(data).toHaveLength(0);
  });

  test('should retry failed jobs', async () => {
    let attempts = 1;
    const supaworker = createSupaworker(clientOptions, workerOptions, async (job) => {
      if (attempts === 1) {
        attempts += 1;
        throw new Error('Test error');
      }
      expect(job.attempts).toBe(2);
      await worker.stop();
    });
    worker = supaworker.worker;
    await supaworker.enqueue([{ queue: 'test', options: { max_attempts: 2 } }]);
    await worker.start();
    const { data } = await supaworker.client.from('jobs').select('id').eq('queue', 'test');
    expect(data).toHaveLength(0);
    expect(attempts).toBe(2);
  });

  test('should retry failed jobs up to the maximum attempts', async () => {
    let attempts = 0;
    const supaworker = createSupaworker(clientOptions, workerOptions, async (job) => {
      attempts += 1;
      expect(job.attempts).toBe(attempts);
      expect(job.attempts).toBeLessThanOrEqual(3);
      throw new Error('Test error');
    });
    setTimeout(() => worker.stop(), 500);
    worker = supaworker.worker;
    await supaworker.enqueue([{ queue: 'test', options: { max_attempts: 3 } }]);
    await worker.start();
    const { data } = await supaworker.client.from('jobs').select('id').eq('queue', 'test');
    expect(data).toHaveLength(0);
    expect(attempts).toBe(3);
  });

  test('should log successful jobs', async () => {
    const supaworker = createSupaworker(
      clientOptions,
      { ...workerOptions, enable_logs: true },
      async () => {
        await worker.stop();
      },
    );
    worker = supaworker.worker;
    const jobs = await supaworker.enqueue([{ queue: 'test' }]);
    await worker.start();
    await new Promise((resolve) => setTimeout(resolve, 500));
    const { data, error } = await supaworker.client
      .from('logs')
      .select('id, status')
      .eq('job->id', jobs!.at(0)!.id);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].status).toBe('success');
  });

  test('should log failed jobs', async () => {
    const supaworker = createSupaworker(
      clientOptions,
      { ...workerOptions, enable_logs: true },
      async () => {
        setTimeout(() => worker.stop(), 500);
        throw new Error('Test error');
      },
    );
    worker = supaworker.worker;
    const jobs = await supaworker.enqueue([{ queue: 'test' }]);
    await worker.start();
    await new Promise((resolve) => setTimeout(resolve, 500));
    const { data, error } = await supaworker.client
      .from('logs')
      .select('id, status')
      .eq('job->id', jobs!.at(0)!.id);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].status).toBe('failure');
  });
});
