import { BitError } from '@teambit/bit-error';

/**
 * Thrown before an install that would switch this workspace between the project-local virtual
 * store (`node_modules/.pnpm`) and pnpm's global virtual store while the running bit itself is
 * installed inside this workspace's `node_modules`.
 *
 * A layout switch rebuilds the workspace's injected component packages from source, which
 * discards their compiled `dist` until the end-of-install compile restores it. A bit that runs
 * from those very packages loses its own code mid-install and crashes before it can recompile,
 * leaving `node_modules` unusable. Steady-state installs are safe in both layouts - they
 * preserve the top-level package directories - so only the one-time transition has to be driven
 * by a bit that lives outside this workspace.
 */
export class SelfHostedVirtualStoreTransition extends BitError {
  constructor(workspacePath: string, enablingGlobalVirtualStore: boolean) {
    const direction = enablingGlobalVirtualStore
      ? 'from the project-local virtual store to the global virtual store'
      : 'from the global virtual store back to the project-local virtual store';
    super(
      `this install would switch "${workspacePath}" ${direction}, but the running bit is itself installed inside this workspace's node_modules.
The switch rebuilds this workspace's component packages from source, which would delete the running bit's compiled code mid-install and leave node_modules broken.
Run this one install with a bit installation that lives outside the workspace (e.g. a bvm-installed bit). Subsequent installs from within the workspace are safe in either layout.`
    );
  }
}
