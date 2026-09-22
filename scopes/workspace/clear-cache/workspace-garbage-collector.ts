import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';
import { compact } from 'lodash';
import { BitError } from '@teambit/bit-error';
import { ComponentID } from '@teambit/component-id';
import { logger } from '@teambit/legacy.logger';
import { concurrentIOLimit } from '@teambit/harmony.modules.concurrency';
import { pMapPool } from '@teambit/toolbox.promise.map-pool';
import type { Repository } from '@teambit/objects';
import { Lane, ModelComponent, Ref, Source, Version } from '@teambit/objects';
import { getAllVersionsInfo } from '@teambit/component.snap-distance';
import type { Scope } from '@teambit/legacy.scope';
import { DELETED_OBJECTS_DIR } from '@teambit/legacy.scope';

/**
 * a leftover of an interrupted atomic write - `<38-hex>.<pid-ish digits>` next to the object it was
 * about to become. `Repository.listRefs` skips them (they're not valid object paths), so nothing
 * ever cleans them up.
 */
const STRAY_TEMP_FILE = /^[0-9a-f]{38}\.\d+$/;

/**
 * how long a file of that shape has to have been sitting there before it counts as abandoned
 * rather than as a write someone is in the middle of.
 */
const STRAY_TEMP_FILE_MIN_AGE_MS = 60 * 60 * 1000;

/**
 * how recently an object must have been written for this run to decline to judge it. covers the
 * gap between another process writing a `Version` and pointing a `ModelComponent` at it.
 */
const RECENT_WRITE_MARGIN_MS = 5 * 60 * 1000;

/**
 * `bit stash` writes a `Version` object into the local scope and records only its hash in a file
 * here. deliberately nothing else refers to it - not the component, not a lane, not `.bitmap`.
 */
const STASH_DIR = 'stash';

export type WorkspaceGcOptions = {
  dryRun?: boolean;
  verbose?: boolean;
  /**
   * in addition to the version each component is checked out at, keep the last N versions of every
   * workspace component, so their recent history (`bit log`, `bit blame`, `bit diff`) stays local.
   */
  keepVersions?: number;
  /**
   * move the objects into a `deleted-objects` directory instead of deleting them, so that
   * `--restore` can bring them back. note that this doesn't free any disk space.
   */
  backup?: boolean;
};

type StrayTempFiles = { count: number; size: number };

export type GcResult = {
  dryRun: boolean;
  /** what --backup asked for. `backupDir` only says where objects went, so a dry run has none */
  backup: boolean;
  backupDir?: string;
  totalObjects: number;
  /** everything the scope holds, the stray temp files included */
  totalSize: number;
  deletedObjects: number;
  /** the objects only. with --backup these bytes move to the backup directory rather than leave */
  deletedSize: number;
  deletedByType: { [type: string]: { count: number; size: number } };
  keptVersions: number;
  strayFiles: number;
  /** freed regardless of --backup, which applies to objects only */
  strayFilesSize: number;
};

/**
 * remove objects a workspace doesn't need from its local scope.
 *
 * a workspace accumulates objects indefinitely: every `bit import` brings the new head of each
 * component along with the source files of that version, and nothing ever removes the versions
 * that were superseded. after a while the bulk of the scope is file contents of versions no one
 * will ever ask for again.
 *
 * unlike the garbage collector that runs on a bare (remote) scope, this one is not bound to keep
 * history: a workspace scope is a cache, not the source of truth. anything deleted here can be
 * re-fetched from the remote, and `sources.get()` already checks whether the specific `Version`
 * object exists locally before deciding it has nothing to fetch.
 *
 * that last point is why versions are pruned whole - the `Version` object together with the
 * `Source` objects it points to. keeping a `Version` whose file contents were deleted would look
 * to the importer exactly like a version that's fully present, so it would skip the fetch and only
 * fail later, when something tries to read the files.
 *
 * the scope itself knows nothing about workspaces. it's given the ids that are in use and the
 * hashes that must survive; deciding what those are is this aspect's job.
 */
export async function collectGarbageInWorkspace(
  scope: Scope,
  workspaceIds: ComponentID[],
  opts: WorkspaceGcOptions = {}
): Promise<GcResult> {
  const { dryRun = false, verbose = false, keepVersions = 0, backup = false } = opts;
  const repo = scope.objects;
  const concurrency = concurrentIOLimit();
  // taken before anything is read, so it's never later than the inventory it will be compared to
  const startedAt = Date.now();

  logger.debug(`gc, classifying the objects of ${scope.name}`);
  const { objects: allObjects, unreadable } = await repo.listObjectsWithType();

  // an object we couldn't classify is an object we can't reason about. if it happens to be a live
  // `Version`, we'd never learn which `Source` objects it points at, and would delete them while
  // leaving the version in place - the one state this collector exists to avoid. so rather than
  // deleting from a partial inventory, refuse to delete at all.
  if (unreadable.length) {
    const list = unreadable.map((ref) => `  ${repo.objectPath(ref)}`).join('\n');
    throw new BitError(`unable to read ${unreadable.length} object(s) in the scope, so it is not safe to run gc.
these objects are most likely corrupted. bit can fetch them again from the remote, so it is safe to
delete them and run gc again:
${list}`);
  }

  const versionSizes = new Map<string, number>();
  const refsByType = new Map<string, Ref[]>();
  let totalSize = 0;
  allObjects.forEach(({ ref, type, size }) => {
    totalSize += size;
    if (type === Version.name) versionSizes.set(ref.toString(), size);
    const existing = refsByType.get(type);
    if (existing) existing.push(ref);
    else refsByType.set(type, [ref]);
  });
  logger.debug(
    `gc, ${allObjects.length} objects: ${[...refsByType.entries()].map(([t, r]) => `${t}:${r.length}`).join(', ')}`
  );

  /**
   * the versions to keep in full. a hash is only accepted if a `Version` object with that hash is
   * actually here - a head pointing at something we never fetched is not our problem to keep.
   */
  const rootVersions = new Set<string>();
  const addRoot = (ref?: Ref | string | null) => {
    if (!ref) return;
    const hash = ref.toString();
    if (versionSizes.has(hash)) rootVersions.add(hash);
  };

  const loadObjectsOfType = async <T>(type: string): Promise<T[]> => {
    const refs = refsByType.get(type) || [];
    const objects = await pMapPool(refs, (ref) => ref.load(repo), { concurrency });
    return compact(objects) as T[];
  };

  const components = await loadObjectsOfType<ModelComponent>(ModelComponent.name);
  const liveLanes = await loadObjectsOfType<Lane>(Lane.name);
  // `bit lane remove` moves the `Lane` object to the trash rather than deleting it, so that it can
  // be brought back. a lane sitting there still names the snaps it held, and if those are gone the
  // lane comes back empty-handed. the collector for bare scopes has always counted them; this one
  // has the same reason to.
  const lanes = [...liveLanes, ...(await getTrashedLanes(repo))];
  const componentsById = new Map(
    components.map((component) => [component.toComponentId().toStringWithoutVersion(), component])
  );

  // the head of every component. `bit log`, `bit status` and the diverge calculation all start
  // there, and it's what `VersionHistory` is repaired from when it turns out to be incomplete.
  const detachedHeads: { component: ModelComponent; head: Ref }[] = [];
  components.forEach((component) => {
    addRoot(component.getHead());
    component.detachedHeads.getAllHeads().forEach((head) => {
      addRoot(head);
      detachedHeads.push({ component, head });
    });
    // an orphaned tag reached this scope through some other remote's cache rather than through the
    // component's origin, which is the whole reason bit holds on to it locally. re-fetching it is
    // not something we can count on, so it is treated like anything else that exists only here.
    Object.values(component.orphanedVersions).forEach(addRoot);
  });

  // the version each workspace component is checked out at - `bit status` diffs the working
  // directory against it, so it's read on virtually every command.
  const workspaceComponents = compact(
    await pMapPool(
      workspaceIds,
      async (id) => {
        const component = await scope.getModelComponentIfExist(id.changeVersion(undefined));
        if (!component) return null;
        addRoot(id.hasVersion() ? component.getRef(id.version as string) : component.getHead());
        return component;
      },
      { concurrency }
    )
  );
  const workspaceComponentIds = new Set(
    workspaceComponents.map((component) => component.toComponentId().toStringWithoutVersion())
  );

  // heads of every component on every local lane, `updateDependents` included.
  const laneHeads: { component: ModelComponent; head: Ref }[] = [];
  lanes.forEach((lane) => {
    lane.toComponentIdsIncludeUpdateDependents().forEach((id) => {
      addRoot(id.version);
      const component = componentsById.get(id.toStringWithoutVersion());
      if (component && id.version) laneHeads.push({ component, head: Ref.from(id.version) });
    });
  });

  // heads we track for remotes. deleting one would break the diverge calculation, which can no
  // longer reach it and has no way to tell that it's gone rather than never-fetched.
  const remoteRefsPerComponent = await repo.remoteLanes.getAllRefsPerComponent();
  remoteRefsPerComponent.forEach((refs) => refs.forEach(addRoot));

  // snaps that were created here and never exported. nothing can bring these back.
  scope.stagedSnaps.getAll().forEach(addRoot);
  repo.unmergedComponents.getComponents().forEach((unmerged) => {
    addRoot(unmerged.head);
    // `unrelated` is a boolean on entries written by older versions, which carry no extra hashes.
    if (typeof unmerged.unrelated === 'object') {
      addRoot(unmerged.unrelated.headOnCurrentLane);
      addRoot(unmerged.unrelated.unrelatedHead);
    }
  });
  (await getStashedHashes(scope.path)).forEach(addRoot);
  await keepUnexportedHistory();

  if (keepVersions > 0) await keepRecentVersions();

  logger.debug(`gc, ${rootVersions.size} root versions before resolving dependencies`);
  await keepFlattenedDependencies();
  logger.debug(`gc, ${rootVersions.size} root versions in total`);

  // expand each kept version into the objects it points at: its files, its build artifacts and its
  // dependency-graph objects. deliberately not its parents - that's the history being pruned.
  const keep = new Set<string>();
  await pMapPool(
    [...rootVersions],
    async (hash) => {
      const version = (await Ref.from(hash).load(repo)) as Version | undefined;
      if (!version) return;
      keep.add(hash);
      version.refsWithOptions(false, true).forEach((ref) => keep.add(ref.toString()));
    },
    { concurrency }
  );

  // everything that is neither a Version nor a Source is structural - components, lanes, version
  // histories, scope metadata. together they're a fraction of a percent of the scope and they're
  // what makes the rest of it navigable, so they're never candidates for deletion.
  const refsToDelete: Ref[] = [];
  const deletedByType: { [type: string]: { count: number; size: number } } = {};
  let deletedSize = 0;
  /**
   * anything written around the time this run started is left alone.
   *
   * an import or a snap writes its `Version` and `Source` objects first and only then points the
   * `ModelComponent` at them. a run that reads the components in between sees objects nothing
   * refers to yet and would take them for garbage. an object that has been sitting here longer
   * than the margin cannot be in that gap.
   *
   * this narrows the window rather than closing it - only a scope-wide lock held across every
   * object write would do that, and there is none today. the cost of being wrong is one more run
   * to collect them.
   */
  const settledBefore = startedAt - RECENT_WRITE_MARGIN_MS;
  let recentlyWritten = 0;
  allObjects.forEach(({ ref, type, size, mtimeMs }) => {
    if (type !== Version.name && type !== Source.name) return;
    if (keep.has(ref.toString())) return;
    if (mtimeMs > settledBefore) {
      recentlyWritten += 1;
      return;
    }
    refsToDelete.push(ref);
    deletedSize += size;
    if (!deletedByType[type]) deletedByType[type] = { count: 0, size: 0 };
    deletedByType[type].count += 1;
    deletedByType[type].size += size;
    if (verbose) logger.console(`gc, deleting ${type} ${ref.toString()}`);
  });
  if (recentlyWritten) {
    logger.debug(`gc, keeping ${recentlyWritten} objects that were written too recently to judge`);
  }

  const strayFiles = await removeStrayTempFiles(repo.getPath(), dryRun);

  if (!dryRun && refsToDelete.length) {
    if (backup) {
      logger.debug(`gc, moving ${refsToDelete.length} objects to ${DELETED_OBJECTS_DIR}`);
      await repo.moveObjectsToDir(refsToDelete, DELETED_OBJECTS_DIR);
    } else {
      logger.debug(`gc, deleting ${refsToDelete.length} objects`);
      await repo.deleteObjectsFromFS(refsToDelete);
    }
  }

  return {
    dryRun,
    backupDir: backup && !dryRun && refsToDelete.length ? path.join(scope.path, DELETED_OBJECTS_DIR) : undefined,
    backup,
    totalObjects: allObjects.length,
    totalSize: totalSize + strayFiles.size,
    deletedObjects: refsToDelete.length,
    deletedSize,
    deletedByType,
    keptVersions: rootVersions.size,
    strayFiles: strayFiles.count,
    strayFilesSize: strayFiles.size,
  };

  /**
   * snaps that were created here and not exported yet must be kept in full, not only their tip -
   * export sends the entire chain up to what the remote already has.
   *
   * this covers both the main head and every local-lane head. `staged-snaps` normally records
   * them, but it's written per-snap and older workspaces predate it, so the chains are walked
   * rather than trusted.
   */
  async function keepUnexportedHistory() {
    const startingPoints = [
      // `getHeadRegardlessOfLane` is not used here: `laneHeadLocal` is populated at runtime by
      // whoever checked the lane out, and these components were loaded straight from the objects.
      ...components.map((component) => ({ component, head: component.getHead() })),
      ...laneHeads,
      // a detached head is a tip like any other, and rooting it alone keeps only that snap. its
      // unexported parents are reachable from nowhere else, so they need the same walk.
      ...detachedHeads,
    ];
    await pMapPool(
      startingPoints,
      async ({ component, head }) => {
        if (!head) return;
        const remoteHeads = remoteRefsPerComponent.get(component.toComponentId().toStringWithoutVersion()) || [];
        if (remoteHeads.some((remoteHead) => remoteHead.isEqual(head))) return; // nothing local
        const versionsInfo = await getAllVersionsInfo({
          modelComponent: component,
          repo,
          startFrom: head,
          stopAt: remoteHeads,
          throws: false,
        });
        versionsInfo.forEach((versionInfo) => addRoot(versionInfo.ref));
      },
      { concurrency }
    );
  }

  /**
   * `--keep-versions N`. the traversal returns the head first, so the first N are the most recent.
   *
   * every head a workspace component has is walked, not only its main one. on a lane, the recent
   * history the user asked for is the lane's, and `getHeadRegardlessOfLane` can't find it here:
   * `laneHeadLocal` is populated at runtime by whoever checked the lane out, while these components
   * came straight from the objects.
   */
  async function keepRecentVersions() {
    const startingPoints = [
      ...workspaceComponents.map((component) => ({ component, head: component.getHead() })),
      ...laneHeads.filter(({ component }) =>
        workspaceComponentIds.has(component.toComponentId().toStringWithoutVersion())
      ),
    ];
    await pMapPool(
      startingPoints,
      async ({ component, head }) => {
        if (!head) return;
        const versionsInfo = await getAllVersionsInfo({
          modelComponent: component,
          repo,
          startFrom: head,
          throws: false,
        });
        versionsInfo.slice(0, keepVersions).forEach((versionInfo) => addRoot(versionInfo.ref));
      },
      { concurrency }
    );
  }

  /**
   * dependencies are needed at the exact version they're pinned to - that's what gets isolated into
   * a capsule on build. `flattenedDependencies` is already transitive, so one pass is enough.
   */
  async function keepFlattenedDependencies() {
    const dependencies = new Set<string>();
    await pMapPool(
      [...rootVersions],
      async (hash) => {
        const version = (await Ref.from(hash).load(repo)) as Version | undefined;
        if (!version) return;
        version.flattenedDependencies.forEach((dependency) => dependencies.add(dependency.toString()));
      },
      { concurrency }
    );
    await pMapPool(
      [...dependencies],
      async (idStr) => {
        const id = ComponentID.fromString(idStr);
        const component = await scope.getModelComponentIfExist(id.changeVersion(undefined));
        if (!component) return;
        addRoot(component.getRef(id.version as string));
      },
      { concurrency }
    );
  }
}

/**
 * the hashes `bit stash` is holding. these are snaps that only ever existed here, so losing them
 * loses the stashed work for good - `bit stash load` would ask for a hash no remote has.
 */
async function getStashedHashes(scopePath: string): Promise<string[]> {
  const stashDir = path.join(scopePath, STASH_DIR);
  if (!(await fs.pathExists(stashDir))) return [];
  const files = (await fs.readdir(stashDir)).filter((file) => file.endsWith('.json'));
  const hashesPerFile = await Promise.all(
    files.map(async (file) => {
      const filePath = path.join(stashDir, file);
      // the same reasoning as an object we can't classify: a stash file is the only record of the
      // snaps it holds, so failing to make sense of one means we don't know what must survive. an
      // empty list here is reserved for a stash that parsed and genuinely holds nothing.
      const unusable = (reason: string) =>
        new BitError(`unable to read the stash file "${filePath}", so it is not safe to run gc.
a stash is the only record of the snaps it holds - they exist nowhere else, and deleting them
cannot be undone. fix or remove the file and run gc again.
Error: ${reason}`);
      let content: Record<string, any>;
      try {
        content = await fs.readJson(filePath);
      } catch (err: any) {
        throw unusable(err.message);
      }
      // parsing is not the same as understanding. this is the shape `StashData.fromObject` needs,
      // and a file that doesn't have it is one `bit stash load` couldn't read either - so reading
      // it as "holds no snaps" is precisely the assumption that would delete them.
      const compsData = content?.stashCompsData;
      if (!Array.isArray(compsData)) throw unusable('"stashCompsData" is missing or is not an array');
      return compsData.map((compData, index) => {
        const hash = compData?.hash;
        if (typeof hash !== 'string' || !hash) {
          throw unusable(`the entry at index ${index} of "stashCompsData" has no "hash"`);
        }
        return hash;
      });
    })
  );
  return hashesPerFile.flat();
}

/**
 * bring back everything sitting in the backup directory.
 *
 * successive --backup runs add to that directory rather than replace it, on the grounds that
 * throwing away an earlier backup to make room for a later one is the more expensive mistake. so
 * this restores every run that is still backed up, not only the last one.
 *
 * the directory is removed once its contents are back in the scope. leaving it would hold on to a
 * second copy of every object - the disk space this command exists to reclaim - and would let a
 * later restore replay objects that a gc since then deliberately removed.
 */
export async function restoreDeletedObjects(scope: Scope, overwrite = false) {
  const deletedObjectsDir = path.join(scope.path, DELETED_OBJECTS_DIR);
  if (!(await fs.pathExists(deletedObjectsDir))) {
    throw new BitError(`there is nothing to restore, "${deletedObjectsDir}" doesn't exist.
it is only created by a garbage collection that ran with --backup`);
  }
  await scope.objects.restoreFromDir(DELETED_OBJECTS_DIR, overwrite);
  await fs.remove(deletedObjectsDir);
}

/**
 * the lanes `bit lane remove` put in the trash. they still name the snaps they held, and the trash
 * exists so the lane can be brought back - which it can't be if its objects went in the meantime.
 *
 * only `Lane` objects are of interest; everything else in there is a component or a version that
 * the rest of the root set already speaks for.
 */
async function getTrashedLanes(repo: Repository): Promise<Lane[]> {
  const refs = await repo.listTrash();
  if (!refs.length) return [];
  logger.debug(`gc, reading ${refs.length} objects from the trash`);
  try {
    const objects = await repo.getFromTrash(refs);
    return objects.filter((object) => object instanceof Lane) as Lane[];
  } catch (err: any) {
    // same reasoning as a stash we can't read: the trash is a recovery mechanism, and not knowing
    // what's in it means not knowing which snaps a restored lane would come back looking for.
    throw new BitError(`unable to read the trash of the scope, so it is not safe to run gc.
the trash holds lanes that "bit lane remove" can bring back, and gc needs to know which snaps they
point at. empty the trash directory ("${repo.getTrashDir()}") if you don't need it, and run again.
Error: ${err.message}`);
  }
}

/**
 * their size is measured, not only their count: these files are deleted outright (even with
 * --backup, which only applies to objects), so their bytes are part of what the run frees and
 * leaving them out understates it - an interrupted write of a large file is exactly the case where
 * the number matters.
 *
 * only files that have been sitting there a while are touched. a temp file of this shape is also
 * what an object write in progress looks like, and unlinking one out from under another bit
 * process would fail its rename. an interrupted write is old by definition, so waiting costs
 * nothing and the race goes away.
 */
async function removeStrayTempFiles(objectsPath: string, dryRun: boolean): Promise<StrayTempFiles> {
  const matches = await glob(path.join('*', '*'), { cwd: objectsPath });
  const candidates = matches.filter((match) => STRAY_TEMP_FILE.test(path.basename(match)));
  if (!candidates.length) return { count: 0, size: 0 };
  const staleBefore = Date.now() - STRAY_TEMP_FILE_MIN_AGE_MS;
  const strays = compact(
    await Promise.all(
      candidates.map(async (candidate) => {
        try {
          const stat = await fs.stat(path.join(objectsPath, candidate));
          if (stat.mtimeMs > staleBefore) return null;
          return { file: candidate, size: stat.size };
        } catch {
          // it vanished between the glob and the stat - either another process finished its rename
          // or something else cleaned up. either way it's not ours to count or remove.
          return null;
        }
      })
    )
  );
  if (!strays.length) return { count: 0, size: 0 };
  logger.debug(`gc, ${strays.length} stray temp files of interrupted writes`);
  if (!dryRun) {
    await Promise.all(strays.map(({ file }) => fs.remove(path.join(objectsPath, file))));
  }
  return { count: strays.length, size: strays.reduce((sum, { size }) => sum + size, 0) };
}
