// In-process background queue for reviews. Runs on a laptop with no Redis.
//
// Rules:
// - At most `concurrency` reviews run at once, so a burst of PRs doesn't hit the AI rate limit.
// - Only one review per PR runs at a time.
// - If a PR gets several pushes while it waits, only the newest one is kept.
//
// Jobs live in memory, so a restart drops the ones still waiting. The next push re-queues the PR.

import type { Logger } from "probot";

type Work = () => Promise<unknown>;

export class ReviewQueue {
  /** Newest waiting job for each PR, oldest PR first. */
  private waiting = new Map<string, Work>();
  private running = new Set<string>();
  private idleWaiters: Array<() => void> = [];

  constructor(
    private log: Pick<Logger, "error">,
    private concurrency = 2,
  ) {}

  /** Queues work for a PR. `key` identifies the PR, e.g. "owner/repo#12". */
  enqueue(key: string, work: Work): void {
    // Replacing a waiting job keeps the PR's place in line but runs the newer push.
    this.waiting.set(key, work);
    this.pump();
  }

  get size(): { waiting: number; running: number } {
    return { waiting: this.waiting.size, running: this.running.size };
  }

  /** Resolves once nothing is waiting or running. Used by tests and on shutdown. */
  onIdle(): Promise<void> {
    if (this.waiting.size === 0 && this.running.size === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  private pump(): void {
    for (const [key, work] of this.waiting) {
      if (this.running.size >= this.concurrency) break;
      if (this.running.has(key)) continue; // runs after the current review of this PR finishes
      this.waiting.delete(key);
      this.running.add(key);
      Promise.resolve()
        .then(work)
        .catch((err) => this.log.error({ err, key }, "Review failed"))
        .finally(() => {
          this.running.delete(key);
          this.pump();
        });
    }
    if (this.waiting.size === 0 && this.running.size === 0) {
      for (const resolve of this.idleWaiters.splice(0)) resolve();
    }
  }
}
