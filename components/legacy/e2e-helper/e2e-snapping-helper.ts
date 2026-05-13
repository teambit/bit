import { execFileSync } from 'child_process';
import path from 'path';
import type { SnapDataPerCompRaw } from '@teambit/snapping';

/**
 * In-process invocation of `SnappingMain.snapFromScope` against a bare scope path. Spawns the
 * compiled `snap-from-scope-runner.js` (built from the sibling `.ts` source) so each call gets a
 * fresh Node process — `loadBit` accumulates module-level state across in-process invocations and
 * that state leaks into downstream shell-spawned `bit` commands when many scenarios share a single
 * test process. Used by e2e tests that need to seed `lane.updateDependents` (hidden cascade
 * entries) on a remote lane.
 *
 * Note: e2e tests consume this helper via `@teambit/legacy.e2e-helper`, which resolves to the
 * package's `dist/` directory at runtime. `__dirname` therefore points at the compiled output
 * where both `.js` files live — there is no `.js` next to the `.ts` in the source tree.
 */
export default class SnappingHelper {
  async snapFromScope(
    scopePath: string,
    snapData: SnapDataPerCompRaw[],
    options: {
      lane?: string;
      updateDependents?: boolean;
      push?: boolean;
      message?: string;
    } = {}
  ): Promise<void> {
    const runnerPath = path.resolve(__dirname, 'snap-from-scope-runner.js');
    execFileSync('node', [runnerPath, scopePath, JSON.stringify(snapData), JSON.stringify(options)], {
      stdio: 'inherit',
    });
  }

  /**
   * Mirrors the Cloud UI's `removeUpdateDependents` GraphQL mutation by invoking
   * `LanesMain.removeUpdateDependents` directly against a bare scope. Default behavior (no `ids`)
   * clears every entry on the lane.
   */
  async removeUpdateDependents(scopePath: string, laneId: string, ids?: string[]): Promise<void> {
    const runnerPath = path.resolve(__dirname, 'remove-update-dependents-runner.js');
    const args = [runnerPath, scopePath, laneId];
    if (ids?.length) args.push(JSON.stringify(ids));
    execFileSync('node', args, { stdio: 'inherit' });
  }
}
