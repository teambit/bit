import type { Component } from '@teambit/component';
import type { ComponentID } from '@teambit/component-id';
import type { Phase } from './phase';

/**
 * Interface the unified loader uses to read workspace/scope state.
 *
 * Why an interface: `@teambit/component-loader` must not depend on
 * `@teambit/workspace` (the workspace package depends on this one). The
 * workspace adapts itself to `LoaderHost` and passes the adapter to the
 * loader at construction time.
 *
 * Lifecycle of a host method during the rewrite:
 *   - **Stage 1** — implementations are thin wrappers around the existing
 *     `WorkspaceComponentLoader` and consumer-component machinery; the host
 *     translates between "phase" and the legacy `loadOpts` shape.
 *   - **Stage 2** — heavier methods (`loadAtPhase`) move into the unified
 *     loader proper; the host shrinks to bitmap/config/file-signature reads.
 *   - **Stage 3** — final shape: only the cheap bitmap/config readers and a
 *     hook for legacy-view derivation remain.
 */
export interface LoaderHost {
  /**
   * Returns the IDs of every component in `.bitmap`. Must be cheap — no
   * per-component disk IO. Used by `loader.listIds()`.
   */
  listBitmapIds(): ComponentID[];

  /**
   * Stable hash of `.bitmap`. Returned to the loader as the `bitmapHash`
   * input to `getHashInputs`. Should be cheap (cached on the workspace side).
   */
  bitmapHash(): string;

  /**
   * Stable hash of `workspace.jsonc` and any other workspace-wide extension
   * inputs. Cheap.
   */
  workspaceConfigHash(): string;

  /**
   * Stable hash of aspect resolution state (resolved aspect package paths,
   * slot registrations). Used as the aspects-phase hash input.
   */
  aspectStateHash(): string;

  /**
   * Per-component file signature (e.g. mtime+size of every owned source file
   * joined deterministically). Used as the files-phase hash input. Required
   * for any phase >= `files`.
   */
  fileSignature(id: ComponentID): string;

  /**
   * Per-component config-inputs hash (component.json plus the slice of
   * variant policy that affects this component). Used as the
   * dependencies/extensions/aspects-phase hash input.
   */
  componentConfigHash(id: ComponentID): string;

  /**
   * Loads a component up to (and including) `phase`, populating prior-phase
   * data in the same pass. The host owns the actual disk-reading and
   * dep-resolution machinery during stage 1; the loader provides caching,
   * sequencing, and observability around it.
   *
   * Contract:
   *  - The returned component MUST have `loadedPhase` set to a value at
   *    least as high as `phase` (the host may load a higher phase if cheap).
   *  - The host MUST NOT consult or update the loader's cache.
   *  - If the component is not present in either the workspace or the local
   *    scope, the host returns `undefined`. The loader translates this into
   *    a `ComponentNotFound` error.
   *  - The host MUST NOT trigger network imports as a side effect — the
   *    loader has been adapted to make import an explicit caller step.
   */
  loadAtPhase(id: ComponentID, phase: Phase): Promise<Component | undefined>;

  /**
   * Optional batched load. If implemented, the unified loader uses this for
   * `getMany` cache-miss processing instead of dispatching per-ID
   * `loadAtPhase` calls through its own worker pool.
   *
   * Hosts implement this to preserve existing batched optimisations. In
   * particular: the legacy loader has a `shouldRunInParallel` gate that
   * switches to sequential loading when the FS dependency-resolution cache
   * is cold, to avoid OOM from many simultaneous dependency parsers each
   * walking `node_modules`. Going through `loadAtPhase` per-ID bypasses
   * this gate; going through this batched method preserves it.
   *
   * Contract: returns a `Map` keyed by `ComponentID.toString()`. IDs that
   * could not be loaded are absent from the map (the loader treats them as
   * not-found).
   */
  loadManyAtPhase?(ids: ComponentID[], phase: Phase): Promise<Map<string, Component>>;
}
