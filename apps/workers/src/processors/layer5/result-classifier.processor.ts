import { Job } from 'bullmq'; export async function resultClassifierProcessor(job: Job) { return { status: 'completed' }; }
