import { Job } from 'bullmq'; export async function executionProcessor(job: Job) { return { status: 'completed' }; }
