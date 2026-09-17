import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';
import { compact } from 'lodash';
import { BitError } from '@teambit/bit-error';
import { ComponentID } from '@teambit/component-id';
import { logger } from '@teambit/legacy.logger';
import { concurrentIOLimit } from '@teambit/harmony.modules.concurrency';
import { pMapPool } from '@teambit/toolbox.promise.map-pool';
import { Lane, ModelComponent, Ref, Source, Version } from '@teambit/objects';
import { getAllVersionsInfo } from '@teambit/component.snap-distance';
import type Scope from './scope';

export const DELETED_OBJECTS_DIR = 'deleted-objects';

/**
 * a leftover of an interrupted atomic write - `<38-hex>.<pid-ish digits>` next to the object it was
 * about to become. `Repository.listRefs` skips them (they're not valid object paths), so nothing
 * ever cleans them up.
 */
const STRAY_TEMP_FILE = /^[0-9a-f]{38}\.\d+$/;

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

export type GcResult = {
  dryRun: boolean;
  backupDir?: string;
  totalObjects: number;
  totalSize: number;
  deletedObjects: number;
  deletedSize: number;
  deletedByType: { [type: string]: { count: number; size: number } };
  keptVersions: number;
  strayFiles: number;
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
 */
export async function collectGarbageInWorkspace(
  scope: Scope,
  workspaceIds: ComponentID[],
  opts: WorkspaceGcOptions = {}
): Promise<GcResult> {
  const { dryRun = false, verbose = false, keepVersions = 0, backup = false } = opts;
  const repo = scope.objects;
  const concurrency = concurrentIOLimit();

  logger.debug(`gc, classifying the objects of ${scope.name}`);
  const allObjects = await repo.listObjectsWithType();

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
  const lanes = await loadObjectsOfType<Lane>(Lane.name);

  // the head of every component. `bit log`, `bit status` and the diverge calculation all start
  // there, and it's what `VersionHistory` is repaired from when it turns out to be incomplete.
  components.forEach((component) => {
    addRoot(component.getHead());
    component.detachedHeads.getAllHeads().forEach(addRoot);
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

  // heads of every component on every local lane, `updateDependents` included.
  lanes.forEach((lane) => {
    lane.toComponentIdsIncludeUpdateDependents().forEach((id) => addRoot(id.version));
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
  allObjects.forEach(({ ref, type, size }) => {
    if (type !== Version.name && type !== Source.name) return;
    if (keep.has(ref.toString())) return;
    refsToDelete.push(ref);
    deletedSize += size;
    if (!deletedByType[type]) deletedByType[type] = { count: 0, size: 0 };
    deletedByType[type].count += 1;
    deletedByType[type].size += size;
    if (verbose) logger.console(`gc, deleting ${type} ${ref.toString()}`);
  });

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
    totalObjects: allObjects.length,
    totalSize,
    deletedObjects: refsToDelete.length,
    deletedSize,
    deletedByType,
    keptVersions: rootVersions.size,
    strayFiles,
  };

  /**
   * a component with snaps that were never exported must keep all of them, not only its head -
   * export sends the entire chain up to what the remote already has.
   */
  async function keepUnexportedHistory() {
    await pMapPool(
      components,
      async (component) => {
        const localHead = component.getHeadRegardlessOfLane();
        if (!localHead) return;
        const remoteHeads = remoteRefsPerComponent.get(component.toComponentId().toStringWithoutVersion()) || [];
        if (remoteHeads.some((remoteHead) => remoteHead.isEqual(localHead))) return; // nothing local
        const versionsInfo = await getAllVersionsInfo({
          modelComponent: component,
          repo,
          startFrom: localHead,
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
   */
  async function keepRecentVersions() {
    await pMapPool(
      workspaceComponents,
      async (component) => {
        const head = component.getHeadRegardlessOfLane();
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

export async function restoreDeletedObjects(scope: Scope, overwrite = false) {
  const deletedObjectsDir = path.join(scope.path, DELETED_OBJECTS_DIR);
  if (!(await fs.pathExists(deletedObjectsDir))) {
    throw new BitError(`there is nothing to restore, "${deletedObjectsDir}" doesn't exist.
it is only created by a garbage collection that ran with --backup`);
  }
  await scope.objects.restoreFromDir(DELETED_OBJECTS_DIR, overwrite);
}

async function removeStrayTempFiles(objectsPath: string, dryRun: boolean): Promise<number> {
  const matches = await glob(path.join('*', '*'), { cwd: objectsPath });
  const strays = matches.filter((match) => STRAY_TEMP_FILE.test(path.basename(match)));
  if (!strays.length) return 0;
  logger.debug(`gc, ${strays.length} stray temp files of interrupted writes`);
  if (!dryRun) {
    await Promise.all(strays.map((stray) => fs.remove(path.join(objectsPath, stray))));
  }
  return strays.length;
}
