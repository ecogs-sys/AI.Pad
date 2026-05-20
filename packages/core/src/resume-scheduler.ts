export interface ResumeSchedulerOptions {
  /** Called with the session id when a pending resume becomes due. */
  onDue: (sessionId: string) => void;
  /** How often the sweep checks pending entries. Default 20s. */
  sweepIntervalMs?: number;
  /** Delay added after the parsed reset time before firing. Default 30s. */
  graceMs?: number;
}

/**
 * Holds one pending resume per session, entirely in memory. A single periodic
 * sweep — not a long-lived setTimeout — fires due entries, which keeps firing
 * robust across OS sleep and clock changes. Pending resumes are never persisted.
 */
export class ResumeScheduler {
  /** sessionId -> resetAt (epoch ms). */
  private readonly pending = new Map<string, number>();
  private readonly onDue: (sessionId: string) => void;
  private readonly graceMs: number;
  private readonly timer: ReturnType<typeof setInterval>;

  constructor(opts: ResumeSchedulerOptions) {
    this.onDue = opts.onDue;
    this.graceMs = opts.graceMs ?? 30_000;
    this.timer = setInterval(() => this.sweep(), opts.sweepIntervalMs ?? 20_000);
    // Do not let the sweep keep the Node event loop (or a test run) alive.
    this.timer.unref?.();
  }

  /** Schedule a resume. Returns false if one is already pending for the session. */
  schedule(sessionId: string, resetAt: number): boolean {
    if (this.pending.has(sessionId)) return false;
    this.pending.set(sessionId, resetAt);
    return true;
  }

  /** Cancel a pending resume. Returns true if one was removed. */
  cancel(sessionId: string): boolean {
    return this.pending.delete(sessionId);
  }

  /** Cancel every pending resume; returns the cancelled session ids. */
  cancelAll(): string[] {
    const ids = [...this.pending.keys()];
    this.pending.clear();
    return ids;
  }

  has(sessionId: string): boolean {
    return this.pending.has(sessionId);
  }

  /** Stop the sweep and drop all pending entries. */
  dispose(): void {
    clearInterval(this.timer);
    this.pending.clear();
  }

  private sweep(): void {
    const now = Date.now();
    for (const [sessionId, resetAt] of [...this.pending]) {
      if (resetAt + this.graceMs <= now) {
        this.pending.delete(sessionId);
        this.onDue(sessionId);
      }
    }
  }
}
