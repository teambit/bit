import type { CLIMain } from '@teambit/cli';
import { CLIAspect, MainRuntime } from '@teambit/cli';
import { getRemoteByName } from '@teambit/scope.remotes';
import { BitError } from '@teambit/bit-error';
import type { Consumer } from '@teambit/legacy.consumer';
import { loadConsumerIfExist } from '@teambit/legacy.consumer';
import { loadScopeIfExist } from '@teambit/legacy.scope';
import ClearCacheCmd from './clear-cache-cmd';
import { GcCmd } from './gc-cmd';
import { ClearCacheAspect } from './clear-cache.aspect';
import type { CacheClearResult } from './clear-cache';
import { clearCache } from './clear-cache';
import type { GcResult, WorkspaceGcOptions } from './workspace-garbage-collector';
import { collectGarbageInWorkspace, restoreDeletedObjects } from './workspace-garbage-collector';

/**
 * avoid adding `workspace` / `scope` aspects as dependencies to this aspect.
 * the clear-cache command is often being used when the workspace/scope is not working properly.
 *
 * `bit gc` lives here because it is the other command that prunes local state, and it reaches the
 * scope and the consumer lazily like the rest of this aspect. unlike `clear-cache` though, it isn't
 * special-cased in `load-bit.ts`, so it runs with the full aspect graph loaded.
 */
export class ClearCacheMain {
  async clearCache(): Promise<CacheClearResult> {
    return clearCache();
  }

  /**
   * remove objects the local scope has no use for.
   *
   * outside a workspace the scope is the source of truth for the components it hosts, so the
   * collector that keeps all history runs instead - the same one remote scopes have been running.
   * it reports its own progress and has nothing to return.
   */
  async garbageCollect(opts: WorkspaceGcOptions = {}): Promise<GcResult | undefined> {
    const scope = await this.getScopeOrThrow();
    // deliberately not `getConsumerGracefully`. it's only the absence of a workspace that may send
    // us down the bare-scope path, and `loadConsumerIfExist` already returns `undefined` for
    // exactly that. swallowing the rest would let a workspace with an unreadable `.bitmap` be
    // collected as if it were a bare scope, which is a different root set - no checked-out
    // versions, no stash - and deleting by it is not recoverable.
    const consumer = await loadConsumerIfExist();
    if (!consumer) {
      await scope.garbageCollect({ dryRun: opts.dryRun, verbose: opts.verbose });
      return undefined;
    }
    // deleted components are included on purpose: their objects are still needed until the deletion
    // has been exported.
    return collectGarbageInWorkspace(scope, consumer.bitmapIdsFromCurrentLaneIncludeRemoved, opts);
  }

  async restoreGarbageCollected(overwrite = false) {
    return restoreDeletedObjects(await this.getScopeOrThrow(), overwrite);
  }

  private async getScopeOrThrow() {
    const scope = await loadScopeIfExist();
    if (!scope) throw new BitError('unable to find a scope. run this command inside a workspace or a scope');
    return scope;
  }

  async clearRemoteCache(remote: string) {
    const maybeConsumer = await this.getConsumerGracefully();
    const remoteObj = await getRemoteByName(remote, maybeConsumer);
    const result = await remoteObj.action('ClearCacheAction', {});
    return result;
  }

  private async getConsumerGracefully(): Promise<Consumer | undefined> {
    try {
      return await loadConsumerIfExist();
    } catch {
      return undefined;
    }
  }

  static slots = [];
  static dependencies = [CLIAspect];
  static runtime = MainRuntime;
  static async provider([cli]: [CLIMain]) {
    const clearCacheMain = new ClearCacheMain();
    cli.register(new ClearCacheCmd(clearCacheMain), new GcCmd(clearCacheMain));
    return clearCacheMain;
  }
}

ClearCacheAspect.addRuntime(ClearCacheMain);
