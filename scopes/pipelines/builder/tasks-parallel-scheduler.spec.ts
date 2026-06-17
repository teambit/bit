import { expect } from 'chai';
import type { SchedulerEntry } from './tasks-parallel-scheduler';
import { splitByLocation, groupByEnv, executeTasksByLocationAndEnv } from './tasks-parallel-scheduler';

// Minimal fakes — the scheduler only reads `task.location`, `task.name` and `env.id`.
function entry(envId: string, name: string, location?: 'start' | 'end'): SchedulerEntry {
  return { env: { id: envId } as any, task: { name, location } as any };
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('tasks-parallel-scheduler', () => {
  describe('splitByLocation', () => {
    it('splits a contiguous start→middle→end queue into one segment per location', () => {
      const queue = [
        entry('envA', 'exporter', 'start'),
        entry('envA', 'compile'),
        entry('envB', 'compile'),
        entry('envA', 'schema', 'end'),
        entry('envB', 'schema', 'end'),
      ];
      const segments = splitByLocation(queue);
      expect(segments).to.have.lengthOf(3);
      expect(segments[0].map((e) => e.task.name)).to.deep.equal(['exporter']);
      expect(segments[1].map((e) => e.task.name)).to.deep.equal(['compile', 'compile']);
      expect(segments[2].map((e) => e.task.name)).to.deep.equal(['schema', 'schema']);
    });

    it('treats undeclared location as middle', () => {
      const segments = splitByLocation([entry('envA', 'a'), entry('envA', 'b')]);
      expect(segments).to.have.lengthOf(1);
    });
  });

  describe('groupByEnv', () => {
    it('groups by env id and preserves each env task order', () => {
      const chains = groupByEnv([
        entry('envA', 'compile'),
        entry('envB', 'compile'),
        entry('envA', 'test'),
        entry('envB', 'test'),
      ]);
      expect(chains).to.have.lengthOf(2);
      expect(chains[0].map((e) => e.task.name)).to.deep.equal(['compile', 'test']);
      expect(chains[1].map((e) => e.task.name)).to.deep.equal(['compile', 'test']);
    });
  });

  describe('executeTasksByLocationAndEnv', () => {
    it('runs every entry exactly once', async () => {
      const queue = [entry('envA', 'compile'), entry('envB', 'compile'), entry('envA', 'schema', 'end')];
      const seen: string[] = [];
      await executeTasksByLocationAndEnv(queue, 4, async (e) => {
        seen.push(`${e.env.id}:${e.task.name}`);
      });
      expect(seen).to.have.lengthOf(3);
      expect(seen.sort()).to.deep.equal(['envA:compile', 'envA:schema', 'envB:compile']);
    });

    it('preserves task order within an env (never reorders an env chain)', async () => {
      // envA's compile is slow; its test must still start only after its compile finishes.
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
      // If envs ran serially, envB would start only after envA's 40ms task ended. Concurrently,
      // envB starts before envA ends.
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

    it('enforces a barrier between locations: no end task starts before all middle tasks finish', async () => {
      const events: string[] = [];
      const queue = [
        entry('envA', 'compile'), // middle, slow
        entry('envB', 'compile'), // middle, fast
        entry('envA', 'schema', 'end'),
        entry('envB', 'schema', 'end'),
      ];
      await executeTasksByLocationAndEnv(queue, 4, async (e) => {
        events.push(`start:${e.task.name}:${e.env.id}`);
        await delay(e.task.name === 'compile' && e.env.id === 'envA' ? 40 : 2);
        events.push(`end:${e.task.name}:${e.env.id}`);
      });
      const lastMiddleEnd = Math.max(events.indexOf('end:compile:envA'), events.indexOf('end:compile:envB'));
      const firstEndStart = Math.min(events.indexOf('start:schema:envA'), events.indexOf('start:schema:envB'));
      expect(firstEndStart).to.be.greaterThan(lastMiddleEnd);
    });

    it('bounds concurrency to the given limit', async () => {
      let inFlight = 0;
      let maxInFlight = 0;
      // 5 separate envs, all in one (middle) location → 5 independent chains.
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
