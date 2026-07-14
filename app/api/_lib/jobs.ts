export type RenderJob = {
  id: string;
  status: "queued" | "processing" | "done" | "error" | "cancelled";
  progress: number;
  message: string;
  outputPath?: string;
  error?: string;
  createdAt: number;
  startedAt?: number;
  priorSeconds?: number; // up-front estimate from the actual work to be done
  etaSeconds?: number;   // remaining seconds, recalibrated from real progress
};

// Stored on globalThis so the map survives Next.js dev hot-reloads
const g = globalThis as any;
if (!g.__renderJobs) g.__renderJobs = new Map<string, RenderJob>();
if (!g.__renderProcs) g.__renderProcs = new Map<string, any>();
const jobs: Map<string, RenderJob> = g.__renderJobs;
const procs: Map<string, any> = g.__renderProcs;

export function createJob(): RenderJob {
  const job: RenderJob = {
    id: crypto.randomUUID(),
    status: "queued",
    progress: 0,
    message: "Received",
    createdAt: Date.now(),
    startedAt: Date.now(),
  };
  jobs.set(job.id, job);
  return job;
}

export function getJob(id: string): RenderJob | undefined {
  return jobs.get(id);
}

// The up-front estimate: computed from the real work (uncached downloads,
// overlays to build, encode length), then blended away as real progress data
// arrives - so the countdown converges instead of lying.
export function setPrior(id: string, seconds: number): void {
  const job = jobs.get(id);
  if (job) {
    job.priorSeconds = Math.max(5, Math.round(seconds));
    if (job.etaSeconds === undefined) job.etaSeconds = job.priorSeconds;
  }
}

export function updateJob(id: string, patch: Partial<RenderJob>): void {
  const job = jobs.get(id);
  if (!job) return;
  Object.assign(job, patch);

  if (job.status === "processing" && job.startedAt) {
    const elapsed = (Date.now() - job.startedAt) / 1000;
    const p = Math.max(1, Math.min(99, job.progress));
    const observed = elapsed * ((100 - p) / p);
    const prior = Math.max(0, (job.priorSeconds ?? observed) - elapsed);
    const w = p / 100; // trust observation more as the render proceeds
    job.etaSeconds = Math.max(1, Math.round(observed * w + prior * (1 - w)));
  } else if (job.status === "done" || job.status === "error" || job.status === "cancelled") {
    job.etaSeconds = 0;
  }
}

export function registerProc(id: string, proc: any): void {
  procs.set(id, proc);
}

export function unregisterProc(id: string): void {
  procs.delete(id);
}

export function isCancelled(id: string): boolean {
  return jobs.get(id)?.status === "cancelled";
}

// Kills the running FFmpeg process (if any) and marks the job cancelled.
export function cancelJob(id: string): boolean {
  const job = jobs.get(id);
  if (!job || job.status === "done" || job.status === "error") return false;
  job.status = "cancelled";
  job.message = "Cancelled";
  job.etaSeconds = 0;
  const proc = procs.get(id);
  if (proc) {
    try {
      proc.kill("SIGKILL");
    } catch {
      // already gone
    }
    procs.delete(id);
  }
  return true;
}
