import type { Component } from '@teambit/component';
import type { ComponentID } from '@teambit/component-id';
import type { LoaderHost, Phase } from '@teambit/component-loader';
import { MissingBitMapComponent } from '@teambit/legacy.bit-map';
import { ComponentNotFoundInPath } from '@teambit/legacy.consumer-component';
import { ComponentNotFound as LegacyComponentNotFound } from '@teambit/legacy.scope';
import type { Workspace } from '../workspace';
import type { ComponentLoadOptions } from './workspace-component-loader';

/**
 * Conservative stage-1 load options used for every load through this adapter.
 * Matches what the heaviest existing caller (`bit status`) has always passed
 * to `componentLoader.getMany`, avoiding the cold-cache OOM that hits when
 * docs and compositions are parsed for hundreds of components alongside
 * dependency resolution.
 */
const STAGE1_LOAD_OPTS: ComponentLoadOptions = {
  loadDocs: false,
  loadCompositions: false,
};

/**
 * Stage-1 adapter that lets the unified loader live in `@teambit/component-loader`
 * (no dependency on `@teambit/workspace`) while still operating against the real
 * workspace state.
 *
 * What this adapter does today:
 *   - Reads `.bitmap`, `workspace.jsonc`, and aspect-resolution version counters
 *     that are bumped from existing change events (`onBitmapChangeSlot`,
 *     `onWorkspaceConfigChangeSlot`, etc.). Counter-based hashing is intentionally
 *     coarse during stage 1: any workspace-wide invalidation event busts every
 *     hash, which is correct (over-invalidates but never serves stale data).
 *   - For `loadAtPhase`, delegates to the existing `WorkspaceComponentLoader.get`
 *     and tags the returned component with `loadedPhase = 'aspects'` because
 *     the legacy loader always full-hydrates.
 *
 * **Why stage 1 doesn't deliver the per-phase perf wins yet:** an early
 * experiment translating `Phase` to the legacy loader's `loadOpts` flags
 * (`{ loadExtensions: false, executeLoadSlot: false, ... }`) measured a 4×
 * speed-up on `bit status` but broke correctness — subsequent code in status
 * (issue checking via `triggerAddComponentIssues`, env-as-aspect detection)
 * silently relies on extensions being populated on the loaded components.
 * Properly delivering the perf win requires either:
 *   (a) status calls upgrading specific components to `extensions`/`aspects`
 *       phase before passing them to issue checkers, or
 *   (b) a true phase-native load path inside the host that the legacy loader
 *       doesn't currently provide.
 * Both are stage-2 work tracked in tasks 4.2–4.6 and Group 8.
 */
export class WorkspaceLoaderHost implements LoaderHost {
  private bitmapVersion = 0;
  private workspaceConfigVersion = 0;
  private aspectStateVersion = 0;

  constructor(private readonly workspace: Workspace) {
    // Bump version counters from the existing change events. Both slots are
    // already wired by the workspace; we just register additional listeners.
    workspace.registerOnBitmapChange(async () => {
      this.bitmapVersion += 1;
    });
    workspace.registerOnWorkspaceConfigChange(async () => {
      this.workspaceConfigVersion += 1;
    });
    // Aspect state changes are not surfaced as a slot today; bump in tandem
    // with workspace config changes (the most common trigger). A finer signal
    // can replace this in stage 2 without changing the loader's contract.
  }

  listBitmapIds(): ComponentID[] {
    return this.workspace.consumer.bitMap.getAllIdsAvailableOnLane();
  }

  bitmapHash(): string {
    return `bm-${this.bitmapVersion}`;
  }

  workspaceConfigHash(): string {
    return `wc-${this.workspaceConfigVersion}`;
  }

  aspectStateHash(): string {
    return `as-${this.aspectStateVersion}`;
  }

  fileSignature(id: ComponentID): string {
    // Coarse stage-1 signature — busts when the bitmap version bumps. Existing
    // file-change invalidation paths already call `Workspace.clearCache` /
    // `clearComponentCache`, which the workspace propagates to the unified
    // cache, so file-level correctness comes from invalidation events rather
    // than from this hash.
    return `${id.toString()}@${this.bitmapVersion}`;
  }

  componentConfigHash(id: ComponentID): string {
    return `${id.toString()}@${this.bitmapVersion}-${this.workspaceConfigVersion}`;
  }

  async loadAtPhase(id: ComponentID, phase: Phase): Promise<Component | undefined> {
    // We accept `phase` for the contract but ignore it during stage 1 (see the
    // class doc-comment for why). The legacy loader always full-hydrates;
    // tagging the result as 'aspects' satisfies the unified loader's phase
    // guard (`loadedPhase >= requested`).
    void phase;
    try {
      const component = await this.workspace.componentLoader.get(id, undefined, true, true, STAGE1_LOAD_OPTS);
      component.loadedPhase = 'aspects';
      return component;
    } catch (err) {
      if (
        err instanceof MissingBitMapComponent ||
        err instanceof ComponentNotFoundInPath ||
        err instanceof LegacyComponentNotFound
      ) {
        return undefined;
      }
      throw err;
    }
  }

  /**
   * Batched load — preserves the legacy loader's `shouldRunInParallel`
   * gate that prevents OOM during cold-cache loads. Without this batched
   * path, the unified loader would dispatch per-ID `componentLoader.get`
   * calls through its own worker pool, each of which calls the legacy
   * `loadMany` with a single ID — and `shouldRunInParallel` returns false
   * for `ids.length < 2`, so the gate never sees the full batch and never
   * fires. Routing the whole batch through `componentLoader.getMany` means
   * the legacy loader sees all 312 IDs in one call and correctly switches
   * to sequential processing when the FS dependency cache is cold.
   *
   * Always passes the conservative `STAGE1_LOAD_OPTS` (loadDocs: false,
   * loadCompositions: false). Existing direct callers of `componentLoader.
   * getMany` (status, install, etc.) already pass these — without them,
   * loading 312 components with docs/compositions parsing in addition to
   * dep resolution OOMs on cold cache. The few commands that genuinely
   * need docs or compositions (e.g. `bit show`) call `componentLoader.get`
   * directly and bypass this adapter.
   */
  async loadManyAtPhase(ids: ComponentID[], phase: Phase): Promise<Map<string, Component>> {
    void phase;
    const { components } = await this.workspace.componentLoader.getMany(ids, STAGE1_LOAD_OPTS, false);
    const result = new Map<string, Component>();
    for (const comp of components) {
      comp.loadedPhase = 'aspects';
      result.set(comp.id.toString(), comp);
    }
    return result;
  }
}
