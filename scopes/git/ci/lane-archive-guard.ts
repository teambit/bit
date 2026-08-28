/**
 * Decides whether `bit ci merge` may archive the lane it just released.
 *
 * A lane is hosted on one scope, but its components can belong to many. Each scope's repository
 * releases only its own slice (the components in its `.bitmap`), so "this repository merged its
 * pull request" is not "the lane is fully released". Archiving after the first slice strands the
 * other slices on a lane nobody can read any more, and every other repository's `bit ci sync`
 * then closes its mirror pull request as if the lane had been deleted.
 *
 * The rule: archive only when every component outside this release — another scope's, or a hidden
 * dependent of this scope that no `.bitmap` lists — is released: either this very
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
import type { ModelComponent, Repository, Version } from '@teambit/objects';
import { Ref } from '@teambit/objects';
import { hasVersionByRef } from '@teambit/component.snap-distance';

export type ForeignLaneComponent = {
  /** the component id, without a version */
  id: string;
  /** the scope the component belongs to (never this repository's `defaultScope`) */
  scope: string;
  /**
   * `true` when this run tagged and exported the component from this very lane head, or the lane head is already on the
   * component's main — in its history, or as the content of its head — or, for a component the lane
   * deletes, when its main is already removed;
   * `false` when it is not (including a component that has no main yet);
   * `undefined` when the state could not be read.
   */
  released: boolean | undefined;
};

export type LaneArchiveDecision = {
  archive: boolean;
  /** what to tell the user; empty when nothing beyond the archive itself is worth saying */
  summary: string;
  /** the lane the decision was made on (see `laneFingerprint`); absent when the lane is gone */
  fingerprint?: string;
};

/** What reading the lane and its foreign components' main history needs from the workspace. */
/** One versioned entry on a lane. `isDeleted` marks a component the lane deletes on merge. */
export type LaneEntry = { id: ComponentID; head: string; isDeleted?: boolean; hidden?: boolean };

/**
 * A lane as read from its hosting scope for the archive decision: the listed components — deleted
 * ones included, since a deletion is lane work the owning scope's release applies — and the hidden
 * `updateDependents` cascade entries.
 */
export type LaneSnapshot = {
  components: LaneEntry[];
  updateDependents: LaneEntry[];
  /** the lane's readme component and its head, when one is set — lane state a writer can change too */
  readme?: string;
};

export type LaneArchiveDeps = {
  /** the remote lane, from its hosting scope; rejects with "was not found" when the lane is gone */
  /** the lane as its hosting scope holds it, deletions and hidden entries included; `undefined` only when the scope has no such lane */
  readLane(laneId: LaneId): Promise<LaneSnapshot | undefined>;
  /** fetch the main history of these components from their own scopes; tolerate a missing main */
  importMainObjects(ids: ComponentID[]): Promise<void>;
  getModelComponent(id: ComponentID): Promise<ModelComponent | undefined>;
  /** fetch these raw objects (lane heads) from the lane's hosting scope, if missing locally */
  importObjectsByHashes(scope: string, hashes: string[]): Promise<void>;
  /**
   * the lane head this run tagged and exported the component from, if this run released it; a lane
   * entry counts as released here only while it still sits at that head
   */
  releasedHeadByThisRun(id: ComponentID): string | undefined;
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
        `All ${foreign.length} component(s) outside this release (scope(s) ${scopesOf(foreign)}) ` +
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
  if ([...pending, ...unknown].some((c) => c.scope === defaultScope)) {
    lines.push(`A hidden dependent of ${defaultScope} is released only by a run that tags a component it depends on.`);
  }
  lines.push(manualArchiveHint(laneId));
  return { archive: false, summary: lines.join('\n') };
}

/**
 * Is `main` the released form of `lane`? `bit ci merge` checks the branch out and tags, so the
 * release carries the lane head's sources and declared dependencies, but not its lineage. The
 * comparison covers what the release transfers and nothing the release itself rewrites:
 * - source files (path and content hash) and the main file;
 * - package dependencies (dependencies, dev, peer) with their ranges;
 * - component dependencies (dependencies, dev, peer) by id and version — a dependency that is itself
 *   on the lane is re-versioned by its release, so main must reference that component's main head;
 * - the binding prefix, the overrides and the package.json changes the component declares;
 * - every extension's `config` and version, with the same rule for an extension that is itself a
 *   component on the lane; not `data`, which the release recomputes (builder, dependencies).
 * Anything else the lane changed (a dependency bump, an env change) leaves `main` different and the
 * component pending — a false "pending" costs a manual archive, a false "released" costs the work.
 */
/**
 * The extension's identity without a version: a component id (`teambit.envs/envs`) by scope and name,
 * a legacy package-named extension (`@scope/pkg`) by its name.
 */
function extensionKey(ext: Version['extensions'][number]): string {
  return ext.extensionId ? ext.extensionId.toStringWithoutVersion() : ext.stringId;
}

/** JSON with object keys in sorted order at every depth, so equal objects serialize equally. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

export function sameReleasedState(
  lane: Version,
  main: Version,
  laneComponentIds: string[],
  mainHeadOf: ReadonlyMap<string, string | undefined>
): boolean {
  const onLane = new Set(laneComponentIds);
  // A component that is itself on the lane is re-versioned by its release. On the lane side its
  // version is the lane snap; on the main side the released state references its main head — any
  // other version is a stale main, not a release. Both sides normalize to one token when they hold
  // the expected version, so only that pairing compares equal.
  const versionToken = (id: string, ver: string | undefined, side: 'lane' | 'main') => {
    if (!onLane.has(id)) return ver ?? '';
    if (side === 'lane') return '<lane>';
    return ver !== undefined && ver === mainHeadOf.get(id) ? '<lane>' : `stale:${ver}`;
  };
  const files = (v: Version) =>
    v.files
      .map((f) => `${f.relativePath}:${f.file.toString()}`)
      .sort()
      .join('\n');
  const packages = (v: Version) =>
    stableStringify([v.packageDependencies, v.devPackageDependencies, v.peerPackageDependencies]);
  const components = (v: Version, side: 'lane' | 'main') =>
    [v.dependencies, v.devDependencies, v.peerDependencies]
      .map((deps) =>
        deps
          .get()
          .map((dep) => {
            const id = dep.id.toStringWithoutVersion();
            return `${id}@${versionToken(id, dep.id.version, side)}`;
          })
          .sort()
          .join(',')
      )
      .join('|');
  const configs = (v: Version, side: 'lane' | 'main') =>
    stableStringify(
      v.extensions
        .map((ext) => {
          const id = extensionKey(ext);
          const ver = ext.extensionId?.version ?? ext.stringId.split('@')[1];
          return [id, versionToken(id, ver, side), ext.config ?? {}] as const;
        })
        .sort(([a], [b]) => a.localeCompare(b))
    );
  const rest = (v: Version) => stableStringify([v.bindingPrefix, v.overrides, v.packageJsonChangedProps]);
  return (
    lane.mainFile === main.mainFile &&
    rest(lane) === rest(main) &&
    files(lane) === files(main) &&
    packages(lane) === packages(main) &&
    components(lane, 'lane') === components(main, 'main') &&
    configs(lane, 'lane') === configs(main, 'main')
  );
}

/**
 * Is the lane head already on the component's main? Either in main's history, or released onto
 * main's head. Throws when an object it needs cannot be loaded.
 */
async function laneHeadIsOnMain(
  modelComponent: ModelComponent,
  laneHead: Ref,
  mainHead: Ref,
  laneComponentIds: string[],
  mainHeadOf: ReadonlyMap<string, string | undefined>,
  objects: Repository
): Promise<boolean> {
  if (await hasVersionByRef(modelComponent, laneHead, objects, mainHead)) return true;
  const laneVersion = (await objects.load(laneHead, true)) as Version;
  const mainVersion = (await objects.load(mainHead, true)) as Version;
  return sameReleasedState(laneVersion, mainVersion, laneComponentIds, mainHeadOf);
}

/**
 * Every versioned entry on the lane: the listed components and the hidden `updateDependents`
 * cascade entries. The hidden entries are lane state too — they carry snaps, they can be foreign,
 * and a release must account for them — even though no `.bitmap` ever lists them.
 */
export function allLaneEntries(lane: LaneSnapshot): LaneEntry[] {
  return [...lane.components, ...lane.updateDependents.map((comp) => ({ ...comp, hidden: true }))];
}

/**
 * The lane's `id@head` set — each entry with its bucket (visible or hidden) and deletion mark — and its
 * readme: what an archive decision is made on, and what must not move before it acts.
 */
export function laneFingerprint(lane: LaneSnapshot): string {
  const entries = allLaneEntries(lane)
    .map(
      (comp) =>
        `${comp.id.toStringWithoutVersion()}@${comp.head}${comp.isDeleted ? ' (deleted)' : ''}${comp.hidden ? ' (hidden)' : ''}`
    )
    .sort();
  return [...entries, `readme:${lane.readme ?? ''}`].join('\n');
}

/**
 * The remote lane, or `undefined` when its hosting scope no longer has it — a positive answer from
 * the dependency (bit's own "no such lane"), never inferred from an error's text. Throws on any
 * other failure to read it, and a lane that cannot be read is never archived.
 */
export async function readRemoteLane(laneId: LaneId, deps: LaneArchiveDeps): Promise<LaneSnapshot | undefined> {
  return deps.readLane(laneId);
}

/**
 * For each component on the remote lane outside this release — another scope's, or a hidden
 * dependent of this scope: is it released? Returns
 * `undefined` when the lane no longer exists on its hosting scope. Throws when the lane cannot be
 * read for any other reason.
 */
export async function foreignLaneComponentsReleaseState(
  laneId: LaneId,
  lane: LaneSnapshot,
  defaultScope: string,
  deps: LaneArchiveDeps
): Promise<ForeignLaneComponent[]> {
  const entries = allLaneEntries(lane);
  // What this release cannot vouch for: every component of another scope, and the hidden cascade
  // entries of this scope — no `.bitmap` lists them, and the tag reaches one only when a component
  // it depends on is tagged in the same run.
  const foreign = entries.filter((comp) => comp.id.scope !== defaultScope || comp.hidden);
  if (!foreign.length) return [];
  const laneComponentIds = entries.map((comp) => comp.id.toStringWithoutVersion());

  const entry = (comp: (typeof foreign)[number], released: boolean | undefined): ForeignLaneComponent => ({
    id: comp.id.toStringWithoutVersion(),
    scope: comp.id.scope as string,
    released,
  });
  // A component this run tagged and exported is released by definition — as long as the lane still
  // sits at the head this run tagged from; a head that moved since is another writer's work. Being
  // in `.bitmap` is not enough: the tag covers changed components only, and a mirror writes the
  // defaultScope slice only.
  const releasedByThisRun = (comp: LaneEntry) =>
    deps.releasedHeadByThisRun(comp.id.changeVersion(undefined)) === comp.head;
  const releasedHere = foreign.filter(releasedByThisRun);
  const others = foreign.filter((comp) => !releasedByThisRun(comp));
  if (!others.length) return releasedHere.map((comp) => entry(comp, true));

  // Each other component's main history comes from its own scope, and its lane head from the
  // lane's hosting scope. A component that has no main yet (created on the lane) is simply absent
  // afterwards, which reads as "not released".
  let objectsImported = true;
  try {
    // every lane component's main is needed: the released state of one references the heads of others
    await deps.importMainObjects(entries.map((comp) => comp.id.changeVersion(undefined)));
    await deps.importObjectsByHashes(
      laneId.scope,
      others.map((comp) => comp.head)
    );
  } catch (e: any) {
    deps.warn(`Could not fetch the history of the lane's foreign components: ${e.message}`);
    objectsImported = false;
  }

  const mainHeadOf = new Map<string, string | undefined>();
  if (objectsImported) {
    await Promise.all(
      entries.map(async (comp) => {
        const id = comp.id.toStringWithoutVersion();
        try {
          const model = await deps.getModelComponent(comp.id.changeVersion(undefined));
          mainHeadOf.set(id, model?.getHeadAsTagIfExist() ?? model?.getHead()?.toString());
        } catch {
          mainHeadOf.set(id, undefined); // unknown head: a reference to it can never read as released
        }
      })
    );
  }

  const states = await Promise.all(
    others.map(async (comp): Promise<ForeignLaneComponent> => {
      if (!objectsImported) return entry(comp, undefined);
      try {
        const modelComponent = await deps.getModelComponent(comp.id.changeVersion(undefined));
        const mainHead = modelComponent?.getHead();
        if (!modelComponent || !mainHead) return entry(comp, false);
        if (comp.isDeleted) {
          // the lane deletes this component; released once its own main head carries the deletion.
          // Read main's head Version itself — ModelComponent.isRemoved() may answer for a lane head.
          const mainVersion = (await deps.objects.load(mainHead, true)) as Version;
          return entry(comp, mainVersion.isRemoved());
        }
        return entry(
          comp,
          await laneHeadIsOnMain(
            modelComponent,
            Ref.from(comp.head),
            mainHead,
            laneComponentIds,
            mainHeadOf,
            deps.objects
          )
        );
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
  let lane: LaneSnapshot | undefined;
  let foreign: ForeignLaneComponent[] | undefined;
  try {
    lane = await readRemoteLane(laneId, deps);
    foreign = lane && (await foreignLaneComponentsReleaseState(laneId, lane, defaultScope, deps));
  } catch (e: any) {
    return {
      archive: false,
      summary:
        `Could not read lane ${laneId.toString()} to check for components outside this release: ${e.message}\n` +
        `Leaving the lane open. ${manualArchiveHint(laneId.toString())}`,
    };
  }
  if (!lane || !foreign) return { archive: true, summary: '' };
  return { ...decideLaneArchive(laneId.toString(), defaultScope, foreign), fingerprint: laneFingerprint(lane) };
}

/**
 * The lane moved between the decision and the archive: another writer exported to it. The
 * decision is stale; archiving now could remove work nobody has looked at.
 */
export function laneMovedSummary(laneId: string): string {
  return (
    `Lane ${laneId} changed while the release was checking it, so it is left open; ` +
    `the next release evaluates the new state. ${manualArchiveHint(laneId)}`
  );
}

/** The lane could not be re-read right before the archive; without a current state, archiving is unsafe. */
export function laneUnreadableBeforeArchiveSummary(laneId: string, error: string): string {
  return (
    `Could not re-read lane ${laneId} before archiving it: ${error}\n` +
    `Leaving the lane open. ${manualArchiveHint(laneId)}`
  );
}
