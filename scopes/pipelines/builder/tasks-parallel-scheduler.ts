/**
 * Opt-in parallel build scheduler (enabled with `BIT_BUILD_CONCURRENCY` / the `build.concurrency`
 * config; default 1 = the original serial `mapSeries` path). It runs environments concurrently while
 * keeping each env's tasks sequential and honoring cross-env task dependencies + location barriers.
 *
 * WHY IT'S OFF BY DEFAULT — it did NOT help Bit's own build. Measured A/B on `bit_pr`, identical
 * 97-component workload (CircleCI 2xlarge, 8 vCPU): serial build-pipeline wall ≈ 17m vs parallel
 * (concurrency=3) ≈ 16m — a ~1m wash, with total `bit ci pr` essentially unchanged. The envs did
 * overlap (parallel wall 16m vs its own task-time sum of 24m), but two effects cancelled the gain:
 *   1. CPU contention. The tasks (tsc/webpack/babel) already saturate all cores on their own, so
 *      running several at once just oversubscribes — per-task times ballooned (one BabelCompile went
 *      19s → 300s) and the heaviest env's chain grew from ~9.7m to ~15.5m, giving back what the
 *      overlap saved.
 *   2. Single-env dominance. ~80% of the work is one env (`core-aspect-env`), a sequential chain
 *      cross-env parallelism can't split — so even with zero contention the floor is ~its own length.
 *
 * It CAN help a workspace whose build is spread across several similarly-sized envs, or a machine
 * with spare cores beyond what one task uses. For a CPU-bound, one-env-dominated build like Bit's,
 * reducing work (e.g. skipping preview/schema on PR builds) beats adding concurrency.
 */
import type { EnvDefinition } from '@teambit/envs';
import type { BuildTask } from './build-task';
import { BuildTaskHelper } from './build-task';

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
 * Indices of the entries (within the same location segment) that `entry` must wait for:
 * - its **per-env predecessor** — the previous entry of the same env. Keeping each env a sequential
 *   chain preserves the `getBuildPipe()` array order (most tasks rely on it, not on `dependencies`)
 *   and means two tasks of the same env never run concurrently (they share a capsule).
 * - every entry whose task type matches one of `entry.task.dependencies` — for **all envs**. This is
 *   the documented "the dependency must be completed for all envs before this task starts" rule, e.g.
 *   the tester depends on the compiler, so tests wait for *every* env's compile, not just their own.
 *
 * Cross-location dependencies (e.g. pkg → typescript) need no handling here: locations run in order
 * with a barrier between them, so an earlier-location dependency is always already done.
 */
export function computeBlockers(entries: SchedulerEntry[]): number[][] {
  const parsedDeps = entries.map((entry) =>
    (entry.task.dependencies || []).map((dep) => BuildTaskHelper.deserializeIdAllowEmptyName(dep))
  );
  return entries.map((entry, i) => {
    const blockers = new Set<number>();
    // per-env predecessor (nearest earlier entry of the same env)
    for (let j = i - 1; j >= 0; j -= 1) {
      if (entries[j].env.id === entry.env.id) {
        blockers.add(j);
        break;
      }
    }
    // declared dependencies, matched across all envs in this location
    const deps = parsedDeps[i];
    if (deps.length) {
      entries.forEach((other, k) => {
        if (k === i) return;
        const matches = deps.some(
          ({ aspectId, name }) => other.task.aspectId === aspectId && (name === undefined || other.task.name === name)
        );
        if (matches) blockers.add(k);
      });
    }
    return [...blockers];
  });
}

/**
 * Run one location segment: every entry starts as soon as its blockers are done, up to `concurrency`
 * at a time. Blockers form a DAG whose edges always point to earlier indices (per-env predecessors
 * are earlier; declared-dependency task types are toposorted earlier by `calculatePipelineOrder`), so
 * there is always a runnable entry and no deadlock. The first executor rejection aborts the segment.
 */
function runLocation(
  entries: SchedulerEntry[],
  concurrency: number,
  executor: (entry: SchedulerEntry) => Promise<void>
): Promise<void> {
  const n = entries.length;
  if (n === 0) return Promise.resolve();
  const blockers = computeBlockers(entries);
  const done: boolean[] = Array.from({ length: n }, () => false);
  const started: boolean[] = Array.from({ length: n }, () => false);

  return new Promise<void>((resolve, reject) => {
    let inFlight = 0;
    let completed = 0;
    let aborted = false;

    const launchReady = () => {
      if (aborted) return;
      if (completed === n) {
        resolve();
        return;
      }
      for (let i = 0; i < n && inFlight < concurrency; i += 1) {
        if (started[i] || !blockers[i].every((b) => done[b])) continue;
        started[i] = true;
        inFlight += 1;
        Promise.resolve()
          .then(() => executor(entries[i]))
          .then(() => {
            done[i] = true;
            inFlight -= 1;
            completed += 1;
            launchReady();
          })
          .catch((err) => {
            aborted = true;
            reject(err);
          });
      }
    };

    launchReady();
  });
}

/**
 * Execute a build-task queue with environments running concurrently.
 *
 * Correctness model — matches the serial `mapSeries` path's guarantees:
 * - **Barrier between location groups** (start → middle → end): a location fully completes before the
 *   next starts. Preserves the start/middle/end ordering (so e.g. preview/pkg in 'end' run after every
 *   compile in 'middle', even though the preview tasks don't declare a compiler dependency) and the
 *   completeness of `previousTasksResults` for later locations.
 * - **Sequential within an env**: each env's tasks run in their original queue order and never overlap
 *   each other (they share a capsule).
 * - **Cross-env declared dependencies honored**: a task waits for its `dependencies` task types across
 *   *all* envs (e.g. tests wait for every env's compile).
 *
 * Note: all envs share one capsule root dir, but this is still safe — every capsule file has a single
 * writer env (a component's `dist` is produced only by its own env; a component's hard-linked
 * artifacts only by the source component's env), and the TS compiler resolves cross-component types
 * from source, so an env's compiled output never depends on a sibling env's build running first.
 */
export async function executeTasksByLocationAndEnv(
  queue: SchedulerEntry[],
  concurrency: number,
  executor: (entry: SchedulerEntry) => Promise<void>
): Promise<void> {
  const limit = Math.max(concurrency, 1);
  const segments = splitByLocation(queue);
  // sequential `for` (not Promise.all) is the location barrier — each segment fully resolves first.
  for (const segment of segments) {
    await runLocation(segment, limit, executor);
  }
}
