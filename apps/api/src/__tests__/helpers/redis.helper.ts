/**
 * Redis helper — provides an ioredis-mock instance and a jest spy
 * that intercepts BullMQ Queue construction so tests never need a
 * real Redis connection.
 *
 * Call `RedisHelper.install()` ONCE at the top of any test file that
 * exercises code which creates a BullMQ Queue (e.g. RequirementsService,
 * KnowledgeBaseService).  The mock captures every `queue.add()` call so
 * you can assert on what was enqueued.
 */

// We mock the entire 'bullmq' module so BullMQ Queue never tries to connect.
jest.mock('bullmq', () => {
  const addedJobs: Array<{ queueName: string; jobName: string; data: unknown }> = [];

  class MockQueue {
    constructor(public readonly name: string) {}
    async add(jobName: string, data: unknown) {
      addedJobs.push({ queueName: this.name, jobName, data });
    }
    async close() {}
  }

  class MockWorker {
    constructor(
      _name: string,
      _processor: unknown,
      _opts?: unknown,
    ) {}
    async close() {}
  }

  return { Queue: MockQueue, Worker: MockWorker, __addedJobs: addedJobs };
});

/** Retrieves the jobs captured by the mock Queue since the last reset */
export function getCapturedJobs(): Array<{ queueName: string; jobName: string; data: unknown }> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('bullmq').__addedJobs as Array<{
    queueName: string;
    jobName: string;
    data: unknown;
  }>;
}

/** Clears the captured jobs list between tests */
export function clearCapturedJobs() {
  const jobs = getCapturedJobs();
  jobs.splice(0, jobs.length);
}
