/**
 * Decides whether `bit ci merge` may archive the lane it just released.
 *
 * A lane is hosted on one scope, but its components can belong to many. Each scope's repository
 * releases only its own slice (the components in its `.bitmap`), so "this repository merged its
 * pull request" is not "the lane is fully released". Archiving after the first slice strands the
 * other slices on a lane nobody can read any more, and every other repository's `bit ci sync`
 * then closes its mirror pull request as if the lane had been deleted.
 *
 * The rule: archive only when every component from another scope is released — either this very
 * run tagged and exported it (the one-repository, many-scopes shape of `bit ci merge`), or it is
 * already on its own scope's main. "On main" is read two ways,
 * because a release reaches main two ways: the lane head is in main's history (a `bit lane merge`),
 * or main's head carries the same files as the lane head (`bit ci merge` checks the branch content
 * out and tags it, so the lane snaps never enter main's ancestry). The last repository to release
 * archives the lane. When a state cannot be determined, the lane stays open — an open lane costs
 * a manual `bit lane remove`, an archived one costs the work on it.
 */
import type { ComponentID } from '@teambit/component-id';
import type { LaneId } from '@teambit/lane-id';
import type { LaneData } from '@teambit/legacy.scope';
import type { ModelComponent, Repository, Version } from '@teambit/objects';
import { Ref } from '@teambit/objects';
import { hasVersionByRef } from '@teambit/component.snap-distance';

export type ForeignLaneComponent = {
  /** the component id, without a version */
  id: string;
  /** the scope the component belongs to (never this repository's `defaultScope`) */
  scope: string;
  /**
   * `true` when this run tagged and exported the component, or the lane head is already on the
   * component's main — in its history, or as the content of its head;
   * `false` when it is not (including a component that has no main yet);
   * `undefined` when the state could not be read.
   */
  released: boolean | undefined;
};

export type LaneArchiveDecision = {
  archive: boolean;
  /** what to tell the user; empty when nothing beyond the archive itself is worth saying */
  summary: string;
};

/** What reading the lane and its foreign components' main history needs from the workspace. */
export type LaneArchiveDeps = {
  /** the remote lane, from its hosting scope; rejects with "was not found" when the lane is gone */
  getLanes(opts: { remote: string; name: string }): Promise<LaneData[]>;
  /** fetch the main history of these components from their own scopes; tolerate a missing main */
  importMainObjects(ids: ComponentID[]): Promise<void>;
  getModelComponent(id: ComponentID): Promise<ModelComponent | undefined>;
  /** fetch these raw objects (lane heads) from the lane's hosting scope, if missing locally */
  importObjectsByHashes(scope: string, hashes: string[]): Promise<void>;
  /** did this run's tag and export include the component (by scope and name) */
  isReleasedByThisRun(id: ComponentID): boolean;
  objects: Repository;
  warn(message: string): void;
};

/** How many component ids a message names before it summarizes the rest. */
const MAX_LISTED = 5;

function listIds(ids: string[]): string {
  const shown = ids.slice(0, MAX_LISTED).join(', ');
  const rest = ids.length - MAX_LISTED;
  return rest > 0 ? `${shown} and ${rest} more` : shown;
}

function scopesOf(components: ForeignLaneComponent[]): string {
  return [...new Set(components.map((c) => c.scope))].sort().join(', ');
}

function manualArchiveHint(laneId: string): string {
  return `To archive it by hand once every slice is released: bit lane remove --remote ${laneId}`;
}

export function decideLaneArchive(
  laneId: string,
  defaultScope: string,
  foreign: ForeignLaneComponent[]
): LaneArchiveDecision {
  if (!foreign.length) return { archive: true, summary: '' };

  const pending = foreign.filter((c) => c.released === false);
  const unknown = foreign.filter((c) => c.released === undefined);

  if (!pending.length && !unknown.length) {
    return {
      archive: true,
      summary:
        `All ${foreign.length} component(s) from other scope(s) (${scopesOf(foreign)}) ` +
        `are already on their main; the lane is fully released.`,
    };
  }

  const lines = [`Lane ${laneId} left open.`];
  if (pending.length) {
    lines.push(
      `${pending.length} component(s) from scope(s) ${scopesOf(pending)} are not on their main yet: ` +
        `${listIds(pending.map((c) => c.id))}.`
    );
  }
  if (unknown.length) {
    lines.push(
      `The state of ${unknown.length} component(s) from scope(s) ${scopesOf(unknown)} could not be read: ` +
        `${listIds(unknown.map((c) => c.id))}.`
    );
  }
  lines.push(
    `This repository releases the ${defaultScope} slice only. The repository of each remaining scope ` +
      `releases its own slice, and the last release archives the lane.`
  );
  lines.push(manualArchiveHint(laneId));
  return { archive: false, summary: lines.join('\n') };
}

/** The same source files with the same content — what `bit ci merge` leaves on main after a release. */
export function sameFiles(a: Version, b: Version): boolean {
  const key = (v: Version) =>
    v.files
      .map((f) => `${f.relativePath}:${f.file.toString()}`)
      .sort()
      .join('\n');
  return a.files.length === b.files.length && key(a) === key(b);
}

/**
 * Is the lane head already on the component's main? Either in main's history, or as the content
 * of main's head. Throws when an object it needs cannot be loaded.
 */
async function laneHeadIsOnMain(
  modelComponent: ModelComponent,
  laneHead: Ref,
  mainHead: Ref,
  objects: Repository
): Promise<boolean> {
  if (await hasVersionByRef(modelComponent, laneHead, objects, mainHead)) return true;
  const laneVersion = (await objects.load(laneHead, true)) as Version;
  const mainVersion = (await objects.load(mainHead, true)) as Version;
  return sameFiles(laneVersion, mainVersion);
}

/**
 * For each component on the remote lane that belongs to another scope: is it released? Returns
 * `undefined` when the lane no longer exists on its hosting scope. Throws when the lane cannot be
 * read for any other reason.
 */
export async function foreignLaneComponentsReleaseState(
  laneId: LaneId,
  defaultScope: string,
  deps: LaneArchiveDeps
): Promise<ForeignLaneComponent[] | undefined> {
  const lanes = await deps.getLanes({ remote: laneId.scope, name: laneId.name }).catch((e) => {
    if (e.toString().includes('was not found')) return [] as LaneData[];
    throw e;
  });
  const lane = lanes[0];
  if (!lane) return undefined;

  const foreign = lane.components.filter((comp) => comp.id.scope !== defaultScope);
  if (!foreign.length) return [];

  const entry = (comp: (typeof foreign)[number], released: boolean | undefined): ForeignLaneComponent => ({
    id: comp.id.toStringWithoutVersion(),
    scope: comp.id.scope as string,
    released,
  });
  // A component this run tagged and exported is released by definition. Being in `.bitmap` is not
  // enough: the tag covers changed components only, and a mirror writes the defaultScope slice only.
  const releasedHere = foreign.filter((comp) => deps.isReleasedByThisRun(comp.id.changeVersion(undefined)));
  const others = foreign.filter((comp) => !deps.isReleasedByThisRun(comp.id.changeVersion(undefined)));
  if (!others.length) return releasedHere.map((comp) => entry(comp, true));

  // Each other component's main history comes from its own scope, and its lane head from the
  // lane's hosting scope. A component that has no main yet (created on the lane) is simply absent
  // afterwards, which reads as "not released".
  let objectsImported = true;
  try {
    await deps.importMainObjects(others.map((comp) => comp.id.changeVersion(undefined)));
    await deps.importObjectsByHashes(
      laneId.scope,
      others.map((comp) => comp.head)
    );
  } catch (e: any) {
    deps.warn(`Could not fetch the history of the lane's foreign components: ${e.message}`);
    objectsImported = false;
  }

  const states = await Promise.all(
    others.map(async (comp): Promise<ForeignLaneComponent> => {
      if (!objectsImported) return entry(comp, undefined);
      try {
        const modelComponent = await deps.getModelComponent(comp.id.changeVersion(undefined));
        const mainHead = modelComponent?.getHead();
        if (!modelComponent || !mainHead) return entry(comp, false);
        return entry(comp, await laneHeadIsOnMain(modelComponent, Ref.from(comp.head), mainHead, deps.objects));
      } catch (e: any) {
        deps.warn(`Could not read the history of ${comp.id.toStringWithoutVersion()}: ${e.message}`);
        return entry(comp, undefined);
      }
    })
  );
  return [...releasedHere.map((comp) => entry(comp, true)), ...states];
}

/**
 * The archive decision for a lane the merge just released. A lane that is already gone archives
 * "as before" (the caller's archive reports not-found the way it always has); a lane that cannot
 * be read stays open.
 */
export async function laneArchiveDecision(
  laneId: LaneId,
  defaultScope: string,
  deps: LaneArchiveDeps
): Promise<LaneArchiveDecision> {
  let foreign: ForeignLaneComponent[] | undefined;
  try {
    foreign = await foreignLaneComponentsReleaseState(laneId, defaultScope, deps);
  } catch (e: any) {
    return {
      archive: false,
      summary:
        `Could not read lane ${laneId.toString()} to check for components of other scopes: ${e.message}\n` +
        `Leaving the lane open. ${manualArchiveHint(laneId.toString())}`,
    };
  }
  if (!foreign) return { archive: true, summary: '' };
  return decideLaneArchive(laneId.toString(), defaultScope, foreign);
}
