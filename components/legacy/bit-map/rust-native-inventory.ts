import path from 'path';
import ignore from 'ignore';
import { runRustWorkspaceInventory, type RustInventoryFile } from '@teambit/component.sources';
import { ALWAYS_IGNORE_LIST, IGNORE_LIST, IGNORE_ROOT_ONLY_LIST } from '@teambit/legacy.constants';
import { captureRustInventoryPolicy } from './rust-inventory-policy';

/** Rust owns paths and policy evaluation; the adapter retains the installed ignore compiler's exact syntax. */
export async function readRustComponentInventory(
  directory: string,
  workspace: string,
  rootIgnore: unknown,
  excludeDirs: string[],
  trackAllFiles: boolean,
  rebase: (pattern: string, directory: string) => string
): Promise<{ count: number; files: RustInventoryFile[] } | undefined> {
  // Only the literal workspace-root component receives nested policies and bitmap protection.
  if (directory !== '.' && path.resolve(workspace, directory) === path.resolve(workspace)) return undefined;
  const root = captureRustInventoryPolicy(rootIgnore);
  if (!root) return undefined;
  const result = await runRustWorkspaceInventory(
    path.resolve(workspace, directory),
    workspace,
    excludeDirs.map((excluded) => path.resolve(workspace, excluded)),
    root.policy,
    (scan) => {
      if (!root.fresh()) return undefined;
      const patterns = scan.nested.flatMap((row) => row.patterns.map((pattern) => rebase(pattern, row.directory)));
      const combined = patterns.length
        ? captureRustInventoryPolicy(
            ignore()
              .add(rootIgnore as any)
              .add(patterns)
          )
        : { policy: { rules: [] } };
      const hard = patterns.length
        ? captureRustInventoryPolicy(ignore().add(trackAllFiles ? ALWAYS_IGNORE_LIST : IGNORE_LIST))
        : { policy: { rules: [] } };
      const own = captureRustInventoryPolicy(ignore().add(scan.own));
      if (!combined || !hard || !own || !root.fresh()) return undefined;
      return {
        combined: combined.policy,
        hard: hard.policy,
        own: own.policy,
        ignoredRoot: trackAllFiles ? [] : IGNORE_ROOT_ONLY_LIST,
      };
    }
  );
  if (!result || !root.fresh()) return undefined;
  root.apply(result.scan.cache);
  return { count: result.scan.count, files: result.files };
}
