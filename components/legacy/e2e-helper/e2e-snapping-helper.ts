import { execFileSync } from 'child_process';
import path from 'path';
import type { SnapDataPerCompRaw } from '@teambit/snapping';

/**
 * In-process invocation of `SnappingMain.snapFromScope` against a bare scope path. Spawns
 * `snap-from-scope-runner.js` so each call gets a fresh Node process — `loadBit` accumulates
 * module-level state across in-process invocations and that state leaks into downstream
 * shell-spawned `bit` commands when many scenarios share a single test process. Used by e2e tests
 * that need to seed `lane.updateDependents` (hidden cascade entries with `skipWorkspace: true`)
 * on a remote lane.
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
}
