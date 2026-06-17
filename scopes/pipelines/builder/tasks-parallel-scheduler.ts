import mapSeries from 'p-map-series';
import type { EnvDefinition } from '@teambit/envs';
import type { BuildTask } from './build-task';

export type SchedulerEntry = { env: EnvDefinition; task: BuildTask };

/**
 * Split an already location-ordered queue (the queue `calculatePipelineOrder` produces is contiguous
 * by location, in the order start → middle → end) into one segment per location group, preserving
 * order. A new segment starts whenever the location changes from the previous entry.
 */
export function splitByLocation(queue: SchedulerEntry[]): SchedulerEntry[][] {
  const segments: SchedulerEntry[][] = [];
  let currentLocation: string | undefined;
  let current: SchedulerEntry[] | undefined;
  queue.forEach((entry) => {
    const location = entry.task.location || 'middle';
    if (!current || location !== currentLocation) {
      current = [];
      segments.push(current);
      currentLocation = location;
    }
    current.push(entry);
  });
  return segments;
}

/**
 * Group a location segment's entries by environment id, preserving each env's original task order.
 */
export function groupByEnv(segment: SchedulerEntry[]): SchedulerEntry[][] {
  const byEnv = new Map<string, SchedulerEntry[]>();
  segment.forEach((entry) => {
    const chain = byEnv.get(entry.env.id) || [];
    chain.push(entry);
    byEnv.set(entry.env.id, chain);
  });
  return [...byEnv.values()];
}

/**
 * Run env chains with a bounded number of concurrent chains. Each chain runs its entries
 * sequentially; up to `concurrency` chains run at once. Dependency-free worker pool (no p-map) — the
 * shared `nextIndex` cursor is safe because JS runs the synchronous increment without interleaving.
 */
async function runChainsWithConcurrency(
  chains: SchedulerEntry[][],
  concurrency: number,
  executor: (entry: SchedulerEntry) => Promise<void>
): Promise<void> {
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < chains.length) {
      const chain = chains[nextIndex];
      nextIndex += 1;
      await mapSeries(chain, executor);
    }
  };
  const workerCount = Math.min(Math.max(concurrency, 1), chains.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
}

/**
 * Execute a build-task queue with environments running concurrently.
 *
 * Correctness model (matches the serial `mapSeries` path's guarantees):
 * - **Barrier between location groups**: a location (start → middle → end) fully completes for all
 *   envs before the next starts. Preserves start/middle/end ordering (compilers in 'middle' finish
 *   before schema/preview/pkg in 'end') and the completeness of `previousTasksResults` for later
 *   locations.
 * - **Sequential within an env**: each env's tasks run in their original queue order. Most tasks
 *   don't declare `dependencies` — they rely on `getBuildPipe()` array order — so tasks of one env
 *   are never reordered or run concurrently with each other.
 * - **Concurrent across envs only**: each env owns an isolated capsule network, so concurrent chains
 *   never write to the same capsule.
 */
export async function executeTasksByLocationAndEnv(
  queue: SchedulerEntry[],
  concurrency: number,
  executor: (entry: SchedulerEntry) => Promise<void>
): Promise<void> {
  const segments = splitByLocation(queue);
  // sequential `for` (not Promise.all) is the location barrier — each segment fully resolves first.
  for (const segment of segments) {
    const envChains = groupByEnv(segment);
    await runChainsWithConcurrency(envChains, concurrency, executor);
  }
}
