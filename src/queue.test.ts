import { describe, expect, it, vi } from "vitest";
import { ReviewQueue } from "./queue.js";

/** A job that stays running until `finish()` is called. */
function gate() {
  let finish!: () => void;
  const done = new Promise<void>((resolve) => (finish = resolve));
  return { done, finish };
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const log = { error: vi.fn() };

describe("ReviewQueue", () => {
  it("runs at most `concurrency` jobs at once", async () => {
    const queue = new ReviewQueue(log, 2);
    const gates = [gate(), gate(), gate()];
    const started: number[] = [];
    gates.forEach((g, i) => queue.enqueue(`pr${i}`, () => (started.push(i), g.done)));
    await tick();
    expect(started).toEqual([0, 1]);

    gates[0].finish();
    await tick();
    expect(started).toEqual([0, 1, 2]);
    gates[1].finish();
    gates[2].finish();
    await queue.onIdle();
  });

  it("keeps only the newest waiting job for a PR", async () => {
    const queue = new ReviewQueue(log, 1);
    const blocker = gate();
    const ran: string[] = [];
    queue.enqueue("other", () => blocker.done);
    queue.enqueue("pr", async () => void ran.push("push 1"));
    queue.enqueue("pr", async () => void ran.push("push 2"));
    queue.enqueue("pr", async () => void ran.push("push 3"));
    blocker.finish();
    await queue.onIdle();
    expect(ran).toEqual(["push 3"]);
  });

  it("never runs two reviews of the same PR at once", async () => {
    const queue = new ReviewQueue(log, 5);
    const first = gate();
    let running = 0;
    let maxRunning = 0;
    const track = async (wait?: Promise<void>) => {
      maxRunning = Math.max(maxRunning, ++running);
      await wait;
      running--;
    };
    queue.enqueue("pr", () => track(first.done));
    await tick();
    queue.enqueue("pr", () => track());
    await tick();
    expect(queue.size).toEqual({ waiting: 1, running: 1 });
    first.finish();
    await queue.onIdle();
    expect(maxRunning).toBe(1);
  });

  it("logs a failed job and keeps going", async () => {
    const errors = { error: vi.fn() };
    const queue = new ReviewQueue(errors, 1);
    const ran = vi.fn(async () => {});
    queue.enqueue("bad", async () => {
      throw new Error("boom");
    });
    queue.enqueue("good", ran);
    await queue.onIdle();
    expect(errors.error).toHaveBeenCalledOnce();
    expect(ran).toHaveBeenCalledOnce();
  });
});
