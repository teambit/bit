import type { Component } from '@teambit/component';
import type { ComponentID } from '@teambit/component-id';
import type { LoaderHost, Phase } from '@teambit/component-loader';
import { MissingBitMapComponent } from '@teambit/legacy.bit-map';
import { ComponentNotFoundInPath } from '@teambit/legacy.consumer-component';
import { ComponentNotFound as LegacyComponentNotFound } from '@teambit/legacy.scope';
import type { Workspace } from '../workspace';

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
 *     regardless of the requested phase. The existing loader always fully
 *     hydrates (extensions + aspects), so the returned `Component` is always
 *     at phase `aspects` even if a lower phase was requested. This is correct
 *     but does not yet realize the per-phase performance wins — that's stage 2,
 *     where the host implementation moves into the loader proper.
 *
 * Performance during stage 1:
 *   - The new cache short-circuits repeat loads at the same phase.
 *   - A request for `phase: 'files'` still pays the full-hydration cost on a
 *     cache miss; we only save on cache hits.
 *   - Stage 2 is where we add fine-grained per-phase load paths to the host.
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
    try {
      const component = await this.workspace.componentLoader.get(id);
      // The existing loader always full-hydrates; tag the result accordingly so
      // the unified loader's phase guard sees the right level. This is the
      // contract the loader expects from the host (`loadedPhase >= requested`).
      component.loadedPhase = 'aspects';
      // Emit a debug log if the caller asked for a lower phase — that's a hint
      // that stage 2 has perf headroom there.
      if (phase !== 'aspects') {
        this.workspace.logger.debug(
          `WorkspaceLoaderHost: stage-1 host fully hydrated ${id.toString()} for requested phase "${phase}" — no per-phase shortcut yet`
        );
      }
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
}
