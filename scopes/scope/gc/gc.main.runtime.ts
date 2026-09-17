import type { CLIMain } from '@teambit/cli';
import { CLIAspect, MainRuntime } from '@teambit/cli';
import type { ScopeMain } from '@teambit/scope';
import { ScopeAspect } from '@teambit/scope';
import type { Workspace } from '@teambit/workspace';
import { WorkspaceAspect } from '@teambit/workspace';
import type { GcResult, WorkspaceGcOptions } from '@teambit/legacy.scope';
import { GcCmd } from './gc-cmd';
import { GcAspect } from './gc.aspect';

export class GcMain {
  constructor(
    private scope: ScopeMain,
    private workspace?: Workspace
  ) {}

  /**
   * remove objects the local scope has no use for.
   *
   * outside a workspace, the scope is the source of truth for the components it hosts, so the
   * collector that keeps all history runs instead - the same one remote scopes have been running.
   * it reports its own progress and has nothing to return.
   */
  async garbageCollect(opts: WorkspaceGcOptions = {}): Promise<GcResult | undefined> {
    const legacyScope = this.scope.legacyScope;
    if (!this.workspace) {
      await legacyScope.garbageCollect({ dryRun: opts.dryRun, verbose: opts.verbose });
      return undefined;
    }
    // deleted components are included on purpose: their objects are still needed until the deletion
    // has been exported.
    return legacyScope.garbageCollectWorkspace(this.workspace.listIdsIncludeRemoved(), opts);
  }

  async restore(overwrite = false) {
    return this.scope.legacyScope.restoreGarbageCollected(overwrite);
  }

  static slots = [];
  static dependencies = [CLIAspect, ScopeAspect, WorkspaceAspect];
  static runtime = MainRuntime;
  static async provider([cli, scope, workspace]: [CLIMain, ScopeMain, Workspace]) {
    const gcMain = new GcMain(scope, workspace);
    cli.register(new GcCmd(gcMain));
    return gcMain;
  }
}

GcAspect.addRuntime(GcMain);
