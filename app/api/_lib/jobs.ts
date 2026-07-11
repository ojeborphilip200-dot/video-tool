export type RenderJob = {
  id: string;
  status: "queued" | "processing" | "done" | "error";
  progress: number;
  message: string;
  outputPath?: string;
  error?: string;
  createdAt: number;
};

// Stored on globalThis so the map survives Next.js dev hot-reloads
const g = globalThis as any;
if (!g.__renderJobs) g.__renderJobs = new Map<string, RenderJob>();
const jobs: Map<string, RenderJob> = g.__renderJobs;

export function createJob(): RenderJob {
  const job: RenderJob = {
    id: crypto.randomUUID(),
    status: "queued",
    progress: 0,
    message: "Received",
    createdAt: Date.now(),
  };
  jobs.set(job.id, job);
  return job;
}

export function getJob(id: string): RenderJob | undefined {
  return jobs.get(id);
}

export function updateJob(id: string, patch: Partial<RenderJob>): void {
  const job = jobs.get(id);
  if (job) Object.assign(job, patch);
}
