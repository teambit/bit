import { resolveRustDependencyScannerExecutable } from './discovery';

export type RustScannerRuntime = { executable: string; workspaceAddon?: string };

/** Explicit scanner settings win; VCS commands otherwise use their verified embedded parser. */
export function resolveRustDependencyScannerRuntime(): RustScannerRuntime | undefined {
  if (process.env.BIT_RUST_DEPENDENCY_SCANNER) {
    const executable = resolveRustDependencyScannerExecutable();
    return executable ? { executable } : undefined;
  }
  if (process.env.BIT_RUST_CLIENT_VCS !== 'on') return undefined;
  try {
    // Keep standalone scanner installations independent of the optional VCS runtime.
    // eslint-disable-next-line global-require
    const discovery = require('@teambit/objects/dist/objects/rust-object-discovery.js') as {
      resolveRustObjectImportExecutable: () => string | undefined;
      resolveRustWorkspaceAddon: (executable: string) => string | undefined;
    };
    const executable = discovery.resolveRustObjectImportExecutable();
    const workspaceAddon = executable && discovery.resolveRustWorkspaceAddon(executable);
    return executable && workspaceAddon ? { executable, workspaceAddon } : undefined;
  } catch {
    return undefined;
  }
}
