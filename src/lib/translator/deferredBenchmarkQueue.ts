/** Holds optional benchmark work until product playback has released priority. */
export class DeferredBenchmarkQueue {
  private readonly jobs = new Map<string, () => void>();

  schedule(turnId: string, job: () => void, defer: boolean) {
    if (!defer) {
      job();
      return false;
    }
    if (this.jobs.has(turnId)) return false;
    this.jobs.set(turnId, job);
    return true;
  }

  flush() {
    const jobs = Array.from(this.jobs.values());
    this.jobs.clear();
    for (const job of jobs) job();
    return jobs.length;
  }
}
