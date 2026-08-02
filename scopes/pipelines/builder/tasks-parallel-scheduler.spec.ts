import { expect } from 'chai';
import type { SchedulerEntry } from './tasks-parallel-scheduler';
import { splitByLocation, computeBlockers, executeTasksByLocationAndEnv } from './tasks-parallel-scheduler';

type EntryOpts = { aspectId?: string; location?: 'start' | 'end'; deps?: string[] };

// Minimal fakes — the scheduler only reads `env.id` and the task's `aspectId`, `name`, `location`,
// `dependencies`. `aspectId` defaults to `name` so a dep referencing `name` matches by aspect id
// (mirrors how real tasks like the tester depend on `CompilerAspect.id`).
function entry(envId: string, name: string, opts: EntryOpts = {}): SchedulerEntry {
  return {
    env: { id: envId } as any,
    task: { aspectId: opts.aspectId ?? name, name, location: opts.location, dependencies: opts.deps } as any,
  };
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('tasks-parallel-scheduler', () => {
  describe('splitByLocation', () => {
    it('splits a contiguous start→middle→end queue into one segment per location', () => {
      const queue = [
        entry('envA', 'exporter', { location: 'start' }),
        entry('envA', 'compile'),
        entry('envB', 'compile'),
        entry('envA', 'schema', { location: 'end' }),
        entry('envB', 'schema', { location: 'end' }),
      ];
      const segments = splitByLocation(queue);
      expect(segments.map((s) => s.length)).to.deep.equal([1, 2, 2]);
    });

    it('treats undeclared location as middle', () => {
      expect(splitByLocation([entry('envA', 'a'), entry('envA', 'b')])).to.have.lengthOf(1);
    });
  });

  describe('computeBlockers', () => {
    it('blocks each task on its per-env predecessor and on its declared deps across ALL envs', () => {
      const entries = [
        entry('envA', 'compile', { aspectId: 'compiler' }), // 0
        entry('envB', 'compile', { aspectId: 'compiler' }), // 1
        entry('envA', 'test', { aspectId: 'tester', deps: ['compiler'] }), // 2
        entry('envB', 'test', { aspectId: 'tester', deps: ['compiler'] }), // 3
      ];
      const blockers = computeBlockers(entries).map((b) => b.slice().sort((x, y) => x - y));
      expect(blockers[0]).to.deep.equal([]); // first compile — nothing
      expect(blockers[1]).to.deep.equal([]); // envB compile — no envB predecessor, no deps
      expect(blockers[2]).to.deep.equal([0, 1]); // envA test — its compile (0) + ALL compiles (0,1)
      expect(blockers[3]).to.deep.equal([0, 1]); // envB test — its compile (1) + ALL compiles (0,1)
    });
  });

  describe('executeTasksByLocationAndEnv', () => {
    it('runs every entry exactly once', async () => {
      const queue = [entry('envA', 'compile'), entry('envB', 'compile'), entry('envA', 'schema', { location: 'end' })];
      const seen: string[] = [];
      await executeTasksByLocationAndEnv(queue, 4, async (e) => {
        seen.push(`${e.env.id}:${e.task.name}`);
      });
      expect(seen.sort()).to.deep.equal(['envA:compile', 'envA:schema', 'envB:compile']);
    });

    it('preserves task order within an env (never reorders or overlaps an env chain)', async () => {
      const events: string[] = [];
      const queue = [entry('envA', 'compile'), entry('envA', 'test')];
      await executeTasksByLocationAndEnv(queue, 4, async (e) => {
        events.push(`start:${e.task.name}`);
        await delay(e.task.name === 'compile' ? 30 : 0);
        events.push(`end:${e.task.name}`);
      });
      expect(events).to.deep.equal(['start:compile', 'end:compile', 'start:test', 'end:test']);
    });

    it('runs different envs concurrently within a location', async () => {
      const events: string[] = [];
      const queue = [entry('envA', 'compile'), entry('envB', 'compile')];
      await executeTasksByLocationAndEnv(queue, 4, async (e) => {
        events.push(`start:${e.env.id}`);
        await delay(e.env.id === 'envA' ? 40 : 5);
        events.push(`end:${e.env.id}`);
      });
      // envB starts before envA ends → proves concurrency.
      expect(events.indexOf('start:envB')).to.be.lessThan(events.indexOf('end:envA'));
    });

    it("honors a cross-env declared dependency: a task waits for ALL envs' dep, not just its own", async () => {
      // envA's compile is fast, envB's compile is slow. envA's test depends on the compiler, so it
      // must wait for envB's compile too — not start right after its own (fast) compile.
      const events: string[] = [];
      const queue = [
        entry('envA', 'compile', { aspectId: 'compiler' }),
        entry('envB', 'compile', { aspectId: 'compiler' }),
        entry('envA', 'test', { aspectId: 'tester', deps: ['compiler'] }),
      ];
      await executeTasksByLocationAndEnv(queue, 4, async (e) => {
        events.push(`start:${e.env.id}:${e.task.name}`);
        await delay(e.env.id === 'envB' && e.task.name === 'compile' ? 40 : 2);
        events.push(`end:${e.env.id}:${e.task.name}`);
      });
      expect(events.indexOf('start:envA:test')).to.be.greaterThan(events.indexOf('end:envB:compile'));
    });

    it('enforces a barrier between locations: no end task starts before all middle tasks finish', async () => {
      const events: string[] = [];
      const queue = [
        entry('envA', 'compile'),
        entry('envB', 'compile'),
        entry('envA', 'preview', { location: 'end' }),
        entry('envB', 'preview', { location: 'end' }),
      ];
      await executeTasksByLocationAndEnv(queue, 4, async (e) => {
        events.push(`start:${e.task.name}:${e.env.id}`);
        await delay(e.task.name === 'compile' && e.env.id === 'envA' ? 40 : 2);
        events.push(`end:${e.task.name}:${e.env.id}`);
      });
      const lastMiddleEnd = Math.max(events.indexOf('end:compile:envA'), events.indexOf('end:compile:envB'));
      const firstEndStart = Math.min(events.indexOf('start:preview:envA'), events.indexOf('start:preview:envB'));
      expect(firstEndStart).to.be.greaterThan(lastMiddleEnd);
    });

    it('bounds concurrency to the given limit', async () => {
      let inFlight = 0;
      let maxInFlight = 0;
      const queue = ['e1', 'e2', 'e3', 'e4', 'e5'].map((id) => entry(id, 'compile'));
      await executeTasksByLocationAndEnv(queue, 2, async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await delay(10);
        inFlight -= 1;
      });
      expect(maxInFlight).to.equal(2);
    });
  });
});
