import mapSeries from 'p-map-series';
import R from 'ramda';
import { BitId, BitIds } from '../../bit-id';
import { CENTRAL_BIT_HUB_NAME, CENTRAL_BIT_HUB_URL, DEFAULT_LANE } from '../../constants';
import GeneralError from '../../error/general-error';
import enrichContextFromGlobal from '../../hooks/utils/enrich-context-from-global';
import { RemoteLaneId } from '../../lane-id/lane-id';
import logger from '../../logger/logger';
import { Remote, Remotes } from '../../remotes';
import componentIdToPackageName from '../../utils/bit/component-id-to-package-name';
import replacePackageName from '../../utils/string/replace-package-name';
import ComponentObjects from '../component-objects';
import { ComponentNotFound, MergeConflict, MergeConflictOnRemote } from '../exceptions';
import ComponentNeedsUpdate from '../exceptions/component-needs-update';
import { Lane, ModelComponent, Symlink, Version } from '../models';
import Source from '../models/source';
import { BitObject, Ref } from '../objects';
import Scope from '../scope';
import { getScopeRemotes } from '../scope-remotes';
import ScopeComponentsImporter from './scope-components-importer';
import { ObjectItem, ObjectList } from '../objects/object-list';
import { ExportPersist, ExportValidate, RemovePendingDir } from '../actions';
import loader from '../../cli/loader';
import { getAllVersionHashes } from './traverse-versions';
import { PersistFailed } from '../exceptions/persist-failed';
import { Http } from '../network/http';

type ModelComponentAndObjects = { component: ModelComponent; objects: BitObject[] };

export type OnExportIdTransformer = (id: BitId) => BitId;
type UpdateDependenciesOnExportFunc = (version: Version, idTransformer: OnExportIdTransformer) => Version;

let updateDependenciesOnExport: UpdateDependenciesOnExportFunc;
export function registerUpdateDependenciesOnExport(func: UpdateDependenciesOnExportFunc) {
  updateDependenciesOnExport = func;
}

/**
 * ** Legacy Only **
 *
 * @TODO there is no real difference between bare scope and a working directory scope - let's adjust terminology to avoid confusions in the future
 * saves a component into the objects directory of the remote scope, then, resolves its
 * dependencies, saves them as well. Finally runs the build process if needed on an isolated
 * environment.
 */
export async function exportManyBareScope(scope: Scope, objectList: ObjectList): Promise<BitIds> {
  logger.debugAndAddBreadCrumb('exportManyBareScope', `started with ${objectList.objects.length} objects`);
  const mergedIds: BitIds = await mergeObjects(scope, objectList);
  logger.debugAndAddBreadCrumb('exportManyBareScope', 'will try to importMany in case there are missing dependencies');
  const scopeComponentsImporter = ScopeComponentsImporter.getInstance(scope);
  await scopeComponentsImporter.importManyFromOriginalScopes(mergedIds); // resolve dependencies
  logger.debugAndAddBreadCrumb('exportManyBareScope', 'successfully ran importMany');
  await scope.objects.persist();
  logger.debugAndAddBreadCrumb('exportManyBareScope', 'objects were written successfully to the filesystem');
  return mergedIds;
}

type ObjectListPerName = { [name: string]: ObjectList };
type ObjectsPerRemote = {
  remote: Remote;
  objectList: ObjectList;
  objectListPerName: ObjectListPerName;
  idsToChangeLocally: BitIds;
  componentsAndObjects: ModelComponentAndObjects[];
  exportedIds?: string[];
};

type RemotesForPersist = {
  remote: Remote;
  exportedIds?: string[];
};

/**
 * the export process uses four steps. read more about it here: https://github.com/teambit/bit/pull/3371
 */
export async function exportMany({
  scope,
  isLegacy,
  ids, // when exporting a lane, the ids are the lane component ids
  remoteName,
  context = {},
  includeDependencies = false, // kind of fork. by default dependencies only cached, with this, their scope-name is changed
  changeLocallyAlthoughRemoteIsDifferent = false, // by default only if remote stays the same the component is changed from staged to exported
  codemod = false,
  lanesObjects = [],
  allVersions,
  originDirectly,
  idsWithFutureScope,
  resumeExportId,
}: {
  scope: Scope;
  isLegacy: boolean;
  ids: BitIds;
  remoteName: string | null | undefined;
  context?: Record<string, any>;
  includeDependencies: boolean;
  changeLocallyAlthoughRemoteIsDifferent: boolean;
  codemod: boolean;
  lanesObjects?: Lane[];
  allVersions: boolean;
  originDirectly?: boolean;
  idsWithFutureScope: BitIds;
  resumeExportId?: string | undefined;
}): Promise<{ exported: BitIds; updatedLocally: BitIds; newIdsOnRemote: BitId[] }> {
  logger.debugAndAddBreadCrumb('scope.exportMany', 'ids: {ids}', { ids: ids.toString() });
  if (lanesObjects.length && !remoteName) {
    throw new Error('todo: implement export lanes to default scopes after tracking lanes local:remote is implemented');
  }
  if (includeDependencies) {
    const dependenciesIds = await getDependenciesImportIfNeeded();
    ids.push(...dependenciesIds);
    ids = BitIds.uniqFromArray(ids);
  }
  const scopeRemotes: Remotes = await getScopeRemotes(scope);
  const idsGroupedByScope = ids.toGroupByScopeName(idsWithFutureScope);
  const groupedByScopeString = Object.keys(idsGroupedByScope)
    .map((scopeName) => `scope "${scopeName}": ${idsGroupedByScope[scopeName].toString()}`)
    .join(', ');
  logger.debug(`export-scope-components, export to the following scopes ${groupedByScopeString}`);
  let manyObjectsPerRemote: ObjectsPerRemote[];
  if (isLegacy) {
    manyObjectsPerRemote = remoteName
      ? [await getUpdatedObjectsToExportLegacy(remoteName, ids, lanesObjects)]
      : await mapSeries(Object.keys(idsGroupedByScope), (scopeName) =>
          getUpdatedObjectsToExportLegacy(scopeName, idsGroupedByScope[scopeName], lanesObjects)
        );
  } else {
    manyObjectsPerRemote = remoteName
      ? [await getUpdatedObjectsToExport(remoteName, ids, lanesObjects)]
      : await mapSeries(Object.keys(idsGroupedByScope), (scopeName) =>
          getUpdatedObjectsToExport(scopeName, idsGroupedByScope[scopeName], lanesObjects)
        );
  }

  if (resumeExportId) {
    const remotes = manyObjectsPerRemote.map((o) => o.remote);
    await validateRemotes(remotes, resumeExportId);
    await persistRemotes(manyObjectsPerRemote, resumeExportId);
  } else if (shouldPushToCentralHub()) {
    await pushAllToCentralHub();
  } else {
    // await pushToRemotes();
    await pushToRemotesCarefully();
  }

  loader.start('updating data locally...');
  const results = await updateLocalObjects(lanesObjects);
  return {
    newIdsOnRemote: R.flatten(results.map((r) => r.newIdsOnRemote)),
    exported: BitIds.uniqFromArray(R.flatten(results.map((r) => r.exported))),
    updatedLocally: BitIds.uniqFromArray(R.flatten(results.map((r) => r.updatedLocally))),
  };

  function transformToOneObjectListWithScopeData(objectsPerRemote: ObjectsPerRemote[]): ObjectList {
    const objectList = new ObjectList();
    objectsPerRemote.forEach((objPerRemote) => {
      objPerRemote.objectList.addScopeName(objPerRemote.remote.name);
      objectList.mergeObjectList(objPerRemote.objectList);
    });
    return objectList;
  }

  function shouldPushToCentralHub(): boolean {
    if (isLegacy || originDirectly) return false;
    const hubRemotes = manyObjectsPerRemote.filter((m) => scopeRemotes.isHub(m.remote.name));
    if (!hubRemotes.length) return false;
    if (hubRemotes.length === manyObjectsPerRemote.length) return true; // all are hub
    // @todo: maybe create a flag "no-central" to support this workflow
    throw new Error(
      `some of your components are configured to be exported to a local scope and some to the bit.dev hub. this is not supported`
    );
  }

  async function pushAllToCentralHub() {
    const objectList = transformToOneObjectListWithScopeData(manyObjectsPerRemote);
    const http = await Http.connect(CENTRAL_BIT_HUB_URL, CENTRAL_BIT_HUB_NAME);
    const pushResults = await http.pushToCentralHub(objectList);
    const { failedScopes, successIds, errors } = pushResults;
    if (failedScopes.length) {
      throw new PersistFailed(failedScopes, errors);
    }
    const exportedBitIds = successIds.map((id) => BitId.parse(id, true));
    manyObjectsPerRemote.forEach((objectPerRemote) => {
      const idsPerScope = exportedBitIds.filter((id) => id.scope === objectPerRemote.remote.name);
      // it's possible that idsPerScope is an empty array, in case the objects were exported already before
      objectPerRemote.exportedIds = idsPerScope.map((id) => id.toString());
    });
  }

  async function getUpdatedObjectsToExportLegacy(
    remoteNameStr: string,
    bitIds: BitIds,
    lanes: Lane[] = []
  ): Promise<ObjectsPerRemote> {
    bitIds.throwForDuplicationIgnoreVersion();
    const remote: Remote = await scopeRemotes.resolve(remoteNameStr, scope);
    const componentObjects = await mapSeries(bitIds, (id) => scope.sources.getObjects(id));
    const idsToChangeLocally = BitIds.fromArray(
      bitIds.filter((id) => !id.scope || id.scope === remoteNameStr || changeLocallyAlthoughRemoteIsDifferent)
    );
    const idsAndObjectsP = lanes.map((laneObj) => laneObj.collectObjectsById(scope.objects));
    const idsAndObjects = R.flatten(await Promise.all(idsAndObjectsP));
    const componentsAndObjects: ModelComponentAndObjects[] = [];
    const objectList = new ObjectList();
    const objectListPerName: ObjectListPerName = {};
    const processComponentObjects = async (componentObject: ComponentObjects) => {
      const componentAndObject = componentObject.toObjects();
      const localVersions = componentAndObject.component.getLocalVersions();
      idsAndObjects.forEach((idAndObjects) => {
        if (componentAndObject.component.toBitId().isEqual(idAndObjects.id)) {
          // @todo: remove duplication. check whether the same hash already exist, and don't push it.
          componentAndObject.objects.push(...idAndObjects.objects);
        }
      });
      componentAndObject.component.clearStateData();
      const didConvertScope = await convertToCorrectScopeLegacy(
        scope,
        componentAndObject,
        remoteNameStr,
        includeDependencies,
        bitIds,
        codemod,
        idsWithFutureScope
      );
      const remoteObj = { url: remote.host, name: remote.name, date: Date.now().toString() };
      componentAndObject.component.addScopeListItem(remoteObj);

      if (idsToChangeLocally.hasWithoutScopeAndVersion(componentAndObject.component.toBitId())) {
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        componentsAndObjects.push(componentAndObject);
      } else {
        // the component should not be changed locally. only add the new scope to the scope-list
        const componentAndObjectCloned = componentObject.toObjects();
        componentAndObjectCloned.component.addScopeListItem(remoteObj);
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        componentsAndObjects.push(componentAndObjectCloned);
      }

      const componentBuffer = await componentAndObject.component.compress();
      const componentData: ObjectItem = {
        ref: componentAndObject.component.hash(),
        buffer: componentBuffer,
        scope: componentAndObject.component.scope as string,
      };
      const getObjectsData = async (): Promise<ObjectItem[]> => {
        // @todo currently, for lanes (componentAndObject.component.head) this optimization is skipped.
        // it should be enabled with a different mechanism
        if (
          allVersions ||
          includeDependencies ||
          didConvertScope ||
          componentAndObject.component.head ||
          lanes.length
        ) {
          // only when really needed (e.g. fork or version changes), collect all versions objects
          return Promise.all(
            componentAndObject.objects.map(async (obj) => ({ ref: obj.hash(), buffer: await obj.compress() }))
          );
        }
        // when possible prefer collecting only new/local versions. the server has already
        // the rest, so no point of sending them.
        return componentAndObject.component.collectVersionsObjects(scope.objects, localVersions);
      };
      const objectsBuffer = await getObjectsData();
      const allObjectsData = [componentData, ...objectsBuffer];
      objectListPerName[componentAndObject.component.name] = new ObjectList(allObjectsData);
      objectList.addIfNotExist(allObjectsData);
    };
    // don't use Promise.all, otherwise, it'll throw "JavaScript heap out of memory" on a large set of data
    await mapSeries(componentObjects, processComponentObjects);
    const lanesData = await Promise.all(
      lanes.map(async (lane) => {
        lane.components.forEach((c) => {
          c.id = c.id.changeScope(remoteName);
        });
        return { ref: lane.hash(), buffer: await lane.compress() };
      })
    );
    objectList.addIfNotExist(lanesData);
    return { remote, objectList, objectListPerName, idsToChangeLocally, componentsAndObjects };
  }

  /**
   * Harmony only. The legacy is running `getUpdatedObjectsToExportLegacy`.
   */
  async function getUpdatedObjectsToExport(
    remoteNameStr: string,
    bitIds: BitIds,
    lanes: Lane[] = []
  ): Promise<ObjectsPerRemote> {
    bitIds.throwForDuplicationIgnoreVersion();
    const remote: Remote = await scopeRemotes.resolve(remoteNameStr, scope);
    const idsToChangeLocally = BitIds.fromArray(
      bitIds.filter((id) => !id.scope || id.scope === remoteNameStr || changeLocallyAlthoughRemoteIsDifferent)
    );
    const componentsAndObjects: ModelComponentAndObjects[] = [];
    const objectList = new ObjectList();
    const objectListPerName: ObjectListPerName = {};
    const processModelComponent = async (modelComponent: ModelComponent) => {
      const versionToExport = await getVersionsToExport(modelComponent);
      modelComponent.clearStateData();
      const objectItems = await modelComponent.collectVersionsObjects(scope.objects, versionToExport);
      const objectsList = await new ObjectList(objectItems).toBitObjects();
      const componentAndObject = { component: modelComponent, objects: objectsList.getAll() };
      await convertToCorrectScopeHarmony(scope, componentAndObject, remoteNameStr, bitIds, idsWithFutureScope);
      const remoteObj = { url: remote.host, name: remote.name, date: Date.now().toString() };
      modelComponent.addScopeListItem(remoteObj);
      componentsAndObjects.push(componentAndObject);
      const componentBuffer = await modelComponent.compress();
      const componentData = { ref: modelComponent.hash(), buffer: componentBuffer, type: modelComponent.getType() };
      const objectsBuffer = await Promise.all(
        componentAndObject.objects.map(async (obj) => ({
          ref: obj.hash(),
          buffer: await obj.compress(),
          type: obj.getType(),
        }))
      );
      const allObjectsData = [componentData, ...objectsBuffer];
      objectListPerName[modelComponent.name] = new ObjectList(allObjectsData);
      objectList.addIfNotExist(allObjectsData);
    };

    const modelComponents = await mapSeries(bitIds, (id) => scope.getModelComponent(id));
    // super important! otherwise, the processModelComponent() changes objects in memory, while the key remains the same
    scope.objects.clearCache();
    // don't use Promise.all, otherwise, it'll throw "JavaScript heap out of memory" on a large set of data
    await mapSeries(modelComponents, processModelComponent);
    const lanesData = await Promise.all(
      lanes.map(async (lane) => {
        lane.components.forEach((c) => {
          c.id = c.id.changeScope(remoteName);
        });
        return { ref: lane.hash(), buffer: await lane.compress() };
      })
    );
    objectList.addIfNotExist(lanesData);

    return { remote, objectList, objectListPerName, idsToChangeLocally, componentsAndObjects };
  }

  async function getVersionsToExport(modelComponent: ModelComponent): Promise<string[]> {
    if (!allVersions) return modelComponent.getLocalTagsOrHashes();
    const allHashes = await getAllVersionHashes(modelComponent, scope.objects, true);
    return modelComponent.switchHashesWithTagsIfExist(allHashes);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async function pushToRemotes(): Promise<void> {
    enrichContextFromGlobal(context);
    const pushOptions = { persist: true };
    const pushedRemotes: Remote[] = [];
    await mapSeries(manyObjectsPerRemote, async (objectsPerRemote: ObjectsPerRemote) => {
      const { remote, objectList } = objectsPerRemote;
      loader.start(`transferring ${objectList.count()} objects to the remote "${remote.name}"...`);
      try {
        const exportedIds = await remote.pushMany(objectList, pushOptions, context);
        logger.debugAndAddBreadCrumb(
          'export-scope-components.pushRemotesPendingDir',
          'successfully pushed all objects to the pending-dir directory on the remote'
        );
        objectsPerRemote.exportedIds = exportedIds;
        pushedRemotes.push(remote);
      } catch (err) {
        logger.warnAndAddBreadCrumb('exportMany', 'failed pushing objects to the remote');
        throw err;
      }
    });
  }

  async function pushToRemotesCarefully() {
    const remotes = manyObjectsPerRemote.map((o) => o.remote);
    const clientId = resumeExportId || Date.now().toString();
    await pushRemotesPendingDir(clientId);
    await validateRemotes(remotes, clientId, Boolean(resumeExportId));
    await persistRemotes(manyObjectsPerRemote, clientId);
  }

  async function pushRemotesPendingDir(clientId: string): Promise<void> {
    if (resumeExportId) {
      logger.debug('pushRemotesPendingDir - skip as the resumeClientId was passed');
      // no need to transfer the objects, they're already on the server. also, since this clientId
      // exists already on the remote pending-dir, it'll cause a collision.
      return;
    }
    const pushOptions = { clientId };
    const pushedRemotes: Remote[] = [];
    await mapSeries(manyObjectsPerRemote, async (objectsPerRemote: ObjectsPerRemote) => {
      const { remote, objectList } = objectsPerRemote;
      loader.start(`transferring ${objectList.count()} objects to the remote "${remote.name}"...`);
      try {
        await remote.pushMany(objectList, pushOptions, context);
        logger.debugAndAddBreadCrumb(
          'export-scope-components.pushRemotesPendingDir',
          'successfully pushed all objects to the pending-dir directory on the remote'
        );
        pushedRemotes.push(remote);
      } catch (err) {
        logger.warnAndAddBreadCrumb('exportMany', 'failed pushing objects to the remote');
        await removePendingDirs(pushedRemotes, clientId);
        throw err;
      }
    });
  }

  async function updateLocalObjects(
    lanes: Lane[]
  ): Promise<Array<{ exported: BitIds; updatedLocally: BitIds; newIdsOnRemote: BitId[] }>> {
    return mapSeries(manyObjectsPerRemote, async (objectsPerRemote: ObjectsPerRemote) => {
      const { remote, idsToChangeLocally, componentsAndObjects, exportedIds } = objectsPerRemote;
      const remoteNameStr = remote.name;
      // on Harmony, version hashes don't change, the new versions will replace the old ones.
      // on the legacy, even when the hash changed, it's fine to have the old objects laying around.
      // (could be removed in the future by some garbage collection).
      const removeComponentVersions = false;
      const refsToRemove = await Promise.all(
        idsToChangeLocally.map((id) => scope.sources.getRefsForComponentRemoval(id, removeComponentVersions))
      );
      scope.objects.removeManyObjects(refsToRemove.flat());
      // @ts-ignore
      idsToChangeLocally.forEach((id) => scope.createSymlink(id, remoteNameStr));
      componentsAndObjects.forEach((componentObject) => scope.sources.put(componentObject));

      // update lanes
      await Promise.all(
        lanes.map(async (lane) => {
          if (idsToChangeLocally.length) {
            // otherwise, we don't want to update scope-name of components in the lane object
            scope.objects.add(lane);
            // this is needed so later on we can add the tracking data and update .bitmap
            // @todo: support having a different name on the remote by a flag
            lane.remoteLaneId = RemoteLaneId.from(lane.name, remoteNameStr);
          }
          await scope.objects.remoteLanes.syncWithLaneObject(remoteNameStr, lane);
        })
      );
      const currentLane = scope.lanes.getCurrentLaneName();
      if (currentLane === DEFAULT_LANE && !lanes.length) {
        // all exported from master
        const remoteLaneId = RemoteLaneId.from(DEFAULT_LANE, remoteNameStr);
        await scope.objects.remoteLanes.loadRemoteLane(remoteLaneId);
        await Promise.all(
          componentsAndObjects.map(async ({ component }) => {
            await scope.objects.remoteLanes.addEntry(remoteLaneId, component.toBitId(), component.getHead());
          })
        );
      }

      await scope.objects.persist();
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const newIdsOnRemote = exportedIds!.map((id) => BitId.parse(id, true));
      // remove version. exported component might have multiple versions exported
      const idsWithRemoteScope: BitId[] = newIdsOnRemote.map((id) => id.changeVersion(undefined));
      const idsWithRemoteScopeUniq = BitIds.uniqFromArray(idsWithRemoteScope);
      return {
        newIdsOnRemote,
        exported: idsWithRemoteScopeUniq,
        updatedLocally: BitIds.fromArray(
          idsWithRemoteScopeUniq.filter((id) => idsToChangeLocally.hasWithoutScopeAndVersion(id))
        ),
      };
    });
  }

  async function getDependenciesImportIfNeeded(): Promise<BitId[]> {
    const scopeComponentImporter = new ScopeComponentsImporter(scope);
    const versionsDependencies = await scopeComponentImporter.importManyWithAllVersions(ids, true, true);
    const allDependencies = R.flatten(
      versionsDependencies.map((versionDependencies) => versionDependencies.allDependencies)
    );
    return allDependencies.map((componentVersion) => componentVersion.component.toBitId());
  }
}

/**
 * merge components into the scope.
 *
 * a component might have multiple versions that some where merged and some were not.
 * the BitIds returned here includes the versions that were merged. so it could contain multiple
 * ids of the same component with different versions
 */
export async function mergeObjects(scope: Scope, objectList: ObjectList, throwForMissingDeps = false): Promise<BitIds> {
  const bitObjectList = await objectList.toBitObjects();
  const components = bitObjectList.getComponents();
  const lanesObjects = bitObjectList.getLanes();
  const versions = bitObjectList.getVersions();
  logger.debugAndAddBreadCrumb(
    'export-scope-components.mergeObjects',
    `Going to merge ${components.length} components, ${lanesObjects.length} lanes`
  );
  const mergeResults = await Promise.all(
    components.map(async (component) => {
      try {
        const result = await scope.sources.merge(component, versions);
        return result;
      } catch (err) {
        if (err instanceof MergeConflict || err instanceof ComponentNeedsUpdate) {
          return err; // don't throw. instead, get all components with merge-conflicts
        }
        throw err;
      }
    })
  );
  // components and lanes can't be just added, they need to be carefully merged.
  const objectsToAdd = bitObjectList.getAllExceptComponentsAndLanes();
  scope.sources.putObjects(objectsToAdd);

  const mergeLaneResultsP = lanesObjects.map((laneObject) => scope.sources.mergeLane(laneObject, false));
  const mergeLaneResults = R.flatten(await Promise.all(mergeLaneResultsP));
  const componentsWithConflicts = mergeResults.filter((result) => result instanceof MergeConflict);
  const componentsNeedUpdate = [
    ...mergeResults.filter((result) => result instanceof ComponentNeedsUpdate),
    ...mergeLaneResults.filter((result) => result instanceof ComponentNeedsUpdate),
  ];
  if (componentsWithConflicts.length || componentsNeedUpdate.length) {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const idsAndVersions = componentsWithConflicts.map((c) => ({ id: c.id, versions: c.versions }));
    const idsAndVersionsWithConflicts = R.sortBy(R.prop('id'), idsAndVersions);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const idsOfNeedUpdateComps = R.sortBy(
      R.prop('id'),
      componentsNeedUpdate.map((c) => ({ id: c.id, lane: c.lane }))
    );
    scope.objects.clearCache(); // just in case this error is caught. we don't want to persist anything by mistake.
    throw new MergeConflictOnRemote(idsAndVersionsWithConflicts, idsOfNeedUpdateComps);
  }
  if (throwForMissingDeps) await throwForMissingLocalDependencies(scope, versions);
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const mergedComponents = mergeResults.filter(({ mergedVersions }) => mergedVersions.length);
  const mergedLanesComponents = mergeLaneResults.filter(({ mergedVersions }) => mergedVersions.length);
  const getMergedIds = ({ mergedComponent, mergedVersions }): BitId[] =>
    mergedVersions.map((version) => mergedComponent.toBitId().changeVersion(version));
  return BitIds.uniqFromArray(R.flatten([...mergedComponents, ...mergedLanesComponents].map(getMergedIds)));
}

/**
 * make sure that all local objects were actually transferred into the remote.
 * this gets called as part of the export-validate step. it doesn't check for dependencies from
 * other scopes, as they'll be retrieved later by the fetch-missing-deps step.
 * we can't wait for that step to validate local dependencies because it happens after persisting,
 * and we don't want to persist when local dependencies were not exported.
 */
async function throwForMissingLocalDependencies(scope: Scope, versions: Version[]) {
  await Promise.all(
    versions.map(async (version) => {
      const depsIds = version.getAllFlattenedDependencies();
      await Promise.all(
        depsIds.map(async (depId) => {
          if (depId.scope !== scope.name) return;
          const existingModelComponent = await scope.getModelComponent(depId);
          const versionRef = existingModelComponent.getRef(depId.version as string);
          if (!versionRef) throw new Error(`unable to find Ref/Hash of ${depId.toString()}`);
          const objectExist = scope.objects.getCache(versionRef) || (await scope.objects.has(versionRef));
          if (!objectExist) throw new ComponentNotFound(depId.toString());
        })
      );
    })
  );
}

/**
 * Component and dependencies id changes:
 * When exporting components with dependencies to a bare-scope, some of the dependencies may be created locally and as
 * a result their scope-name is null. Once the bare-scope gets the components, it needs to convert these scope names
 * to the bare-scope name.
 * Since the changes it does affect the Version objects, the version REF of a component, needs to be changed as well.
 *
 * Dist code changes:
 * see https://github.com/teambit/bit/issues/1770 for complete info
 * some compilers require the links to be part of the bundle, change the component name in these
 * files from the id without scope to the id with the scope
 * e.g. `@bit/utils.is-string` becomes `@bit/scope-name.utils.is-string`.
 * these files changes need to be done regardless the "--rewire" flag.
 *
 * Source code changes (codemod):
 * when "--rewire" flag is used, import/require statement should be changed from the old scope-name
 * to the new scope-name. Or from no-scope to the new scope.
 */
async function convertToCorrectScopeLegacy(
  scope: Scope,
  componentsObjects: ModelComponentAndObjects,
  remoteScope: string,
  fork: boolean,
  exportingIds: BitIds,
  codemod: boolean,
  idsWithFutureScope: BitIds
): Promise<boolean> {
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const versionsObjects: Version[] = componentsObjects.objects.filter((object) => object instanceof Version);
  const haveVersionsChanged = await Promise.all(
    versionsObjects.map(async (objectVersion: Version) => {
      const hashBefore = objectVersion.hash().toString();
      const didCodeMod = await _replaceSrcOfVersionIfNeeded(objectVersion);
      const didDependencyChange = changeDependencyScope(objectVersion);
      changeExtensionsScope(objectVersion);
      if (updateDependenciesOnExport && typeof updateDependenciesOnExport === 'function') {
        // @ts-ignore
        objectVersion = updateDependenciesOnExport(objectVersion, getIdWithUpdatedScope.bind(this));
      }
      // @todo: after v15 is deployed, remove the following code until the next "// END" comment.
      // this is currently needed because remote-servers with older code still saving Version
      // objects into the calculated hash path and not into the originally created hash.
      // in this scenario, the calculated hash is different than the original hash due to the scope
      // changes. if we don't do this hash replacement, these remote servers will write the version
      // objects into different paths and then throw an error of component-not-found due to failure
      // finding the Version objects on the fs.
      const hashAfter = objectVersion.calculateHash().toString();
      const isTag = componentsObjects.component.getTagOfRefIfExists(objectVersion.hash());
      if (isTag && hashBefore !== hashAfter) {
        if (!didCodeMod && !didDependencyChange) {
          throw new Error('hash should not be changed if there was not any dependency scope changes nor codemod');
        }
        objectVersion._hash = hashAfter;
        logger.debugAndAddBreadCrumb(
          'scope._convertToCorrectScope',
          `switching {id} version hash from ${hashBefore} to ${hashAfter}`,
          { id: componentsObjects.component.id().toString() }
        );
        const versions = componentsObjects.component.versions;
        Object.keys(versions).forEach((version) => {
          if (versions[version].toString() === hashBefore) {
            componentsObjects.component.setVersion(version, Ref.from(hashAfter));
          }
        });
        if (componentsObjects.component.getHeadStr() === hashBefore) {
          componentsObjects.component.setHead(Ref.from(hashAfter));
        }
        versionsObjects.forEach((versionObj) => {
          versionObj.parents = versionObj.parents.map((parent) => {
            if (parent.toString() === hashBefore) return Ref.from(hashAfter);
            return parent;
          });
        });
      }
      // END DELETION OF BIT > v15.
      return didCodeMod || didDependencyChange;
    })
  );
  const hasComponentChanged = remoteScope !== componentsObjects.component.scope;
  componentsObjects.component.scope = remoteScope;

  // return true if one of the versions has changed or the component itself
  return haveVersionsChanged.some((x) => x) || hasComponentChanged;

  function changeDependencyScope(version: Version): boolean {
    let hasChanged = false;
    version.getAllDependencies().forEach((dependency) => {
      const updatedScope = getIdWithUpdatedScope(dependency.id);
      if (!updatedScope.isEqual(dependency.id)) {
        hasChanged = true;
        dependency.id = updatedScope;
      }
    });
    const ids: BitIds = version.flattenedDependencies;
    const needsChange = ids.some((id) => id.scope !== remoteScope);
    if (needsChange) {
      version.flattenedDependencies = getBitIdsWithUpdatedScope(ids);
      hasChanged = true;
    }
    return hasChanged;
  }

  function changeExtensionsScope(version: Version): boolean {
    let hasChanged = false;
    version.extensions.forEach((ext) => {
      if (ext.extensionId) {
        const updatedScope = getIdWithUpdatedScope(ext.extensionId);
        if (!updatedScope.isEqual(ext.extensionId)) {
          hasChanged = true;
          ext.extensionId = updatedScope;
        }
      }
    });
    return hasChanged;
  }

  function getIdWithUpdatedScope(dependencyId: BitId): BitId {
    if (dependencyId.scope === remoteScope) {
      return dependencyId; // nothing has changed
    }
    if (!dependencyId.scope || fork || exportingIds.hasWithoutVersion(dependencyId)) {
      const depId = ModelComponent.fromBitId(dependencyId);
      // todo: use 'load' for async and switch the foreach with map.
      const dependencyObject = scope.objects.loadSync(depId.hash());
      if (dependencyObject instanceof Symlink) {
        return dependencyId.changeScope(dependencyObject.realScope);
      }
      const currentlyExportedDep = idsWithFutureScope.searchWithoutScopeAndVersion(dependencyId);
      if (currentlyExportedDep && currentlyExportedDep.scope) {
        // it's possible that a dependency has a different defaultScope settings.
        return dependencyId.changeScope(currentlyExportedDep.scope);
      }
      return dependencyId.changeScope(remoteScope);
    }
    return dependencyId;
  }
  function getBitIdsWithUpdatedScope(bitIds: BitIds): BitIds {
    const updatedIds = bitIds.map((id) => getIdWithUpdatedScope(id));
    return BitIds.fromArray(updatedIds);
  }
  async function _replaceSrcOfVersionIfNeeded(version: Version): Promise<boolean> {
    let hasVersionChanged = false;
    const processFile = async (file, isDist: boolean) => {
      const newFileObject = await _createNewFileIfNeeded(version, file, isDist);
      if (newFileObject && (codemod || isDist)) {
        file.file = newFileObject.hash();
        componentsObjects.objects.push(newFileObject);
        hasVersionChanged = true;
      }
      return null;
    };
    await Promise.all(version.files.map((file) => processFile(file, false)));
    await Promise.all((version.dists || []).map((file) => processFile(file, true)));
    return hasVersionChanged;
  }
  /**
   * in the following cases it is needed to change files content:
   * 1. fork. exporting components of scope-a to scope-b. requirement: 1) --rewire flag. 2) id must have scope.
   * 2. dists. changing no-scope to current scope. requirement: 1) id should not have scope.
   * 3. no-scope. changing src no-scope to current scope. requirement: 1) --rewire flag. 2) id should not have scope.
   *
   * according to these three. if --rewire was not used and id has scope, no need to do anything.
   *
   * in the following conditions the process should stop and ask for --rewire flag:
   * 1. --rewire flag was not entered.
   * 2. id does not have scope.
   * 3. the file is not a dist file.
   * 4. the file content has pkg name without scope-name.
   */
  async function _createNewFileIfNeeded(
    version: Version,
    file: Record<string, any>,
    isDist: boolean
  ): Promise<Source | null | undefined> {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const currentHash = file.file;
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const fileObject: Source = await scope.objects.load(currentHash);
    const fileString = fileObject.contents.toString();
    const dependenciesIds = version.getAllDependencies().map((d) => d.id);
    const componentId = componentsObjects.component.toBitId();
    const allIds = [...dependenciesIds, componentId];
    let newFileString = fileString;
    allIds.forEach((id) => {
      if (id.scope === remoteScope) {
        return; // nothing to do, the remote has not changed
      }
      const idWithNewScope = id.changeScope(remoteScope);
      const pkgNameWithOldScope = componentIdToPackageName({
        id,
        bindingPrefix: componentsObjects.component.bindingPrefix,
        extensions: version.extensions,
      });
      if (!codemod) {
        // use did not enter --rewire flag
        if (id.hasScope()) {
          return; // because only --rewire is permitted to change from scope-a to scope-b.
        }
        // dists can change no-scope to scope without --rewire flag. if this is not a dist file
        // and the file needs to change from no-scope to scope, it needs to --rewire flag.
        // for non-legacy the no-scope is not possible, so no need to check for it.
        if (!isDist && fileString.includes(pkgNameWithOldScope) && version.isLegacy) {
          throw new GeneralError(`please use "--rewire" flag to fix the import/require statements "${pkgNameWithOldScope}" in "${
            file.relativePath
          }" file of ${componentId.toString()},
the current import/require module has no scope-name, which result in an invalid module path upon import`);
        }
      }
      // at this stage, we know that either 1) --rewire was used. 2) it's dist and id doesn't have scope-name
      // in both cases, if the file has the old package-name, it should be replaced to the new one.
      const pkgNameWithNewScope = componentIdToPackageName({
        id: idWithNewScope,
        bindingPrefix: componentsObjects.component.bindingPrefix,
        extensions: version.extensions,
      });
      // replace old scope to a new scope (e.g. '@bit/old-scope.is-string' => '@bit/new-scope.is-string')
      // or no-scope to a new scope. (e.g. '@bit/is-string' => '@bit/new-scope.is-string')
      newFileString = replacePackageName(newFileString, pkgNameWithOldScope, pkgNameWithNewScope);
    });
    if (newFileString !== fileString) {
      return Source.from(Buffer.from(newFileString));
    }
    return null;
  }
}

/**
 * Component and dependencies id changes:
 * When exporting components with dependencies to a bare-scope, some of the dependencies may be created locally and as
 * a result their scope-name is null. Before the bare-scope gets the components, convert these scope names
 * to the bare-scope name.
 *
 * This is the Harmony version of "convertToCorrectScope". No more codemod and no more hash changes.
 */
async function convertToCorrectScopeHarmony(
  scope: Scope,
  componentsObjects: ModelComponentAndObjects,
  remoteScope: string,
  exportingIds: BitIds,
  idsWithFutureScope: BitIds
): Promise<boolean> {
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const versionsObjects: Version[] = componentsObjects.objects.filter((object) => object instanceof Version);
  const haveVersionsChanged = await Promise.all(
    versionsObjects.map(async (objectVersion: Version) => {
      const didDependencyChange = changeDependencyScope(objectVersion);
      changeExtensionsScope(objectVersion);
      if (updateDependenciesOnExport && typeof updateDependenciesOnExport === 'function') {
        // @ts-ignore
        objectVersion = updateDependenciesOnExport(objectVersion, getIdWithUpdatedScope.bind(this));
      }
      return didDependencyChange;
    })
  );
  const hasComponentChanged = remoteScope !== componentsObjects.component.scope;
  componentsObjects.component.scope = remoteScope;

  // return true if one of the versions has changed or the component itself
  return haveVersionsChanged.some((x) => x) || hasComponentChanged;

  function changeDependencyScope(version: Version): boolean {
    let hasChanged = false;
    version.getAllDependencies().forEach((dependency) => {
      const updatedScope = getIdWithUpdatedScope(dependency.id);
      if (!updatedScope.isEqual(dependency.id)) {
        hasChanged = true;
        dependency.id = updatedScope;
      }
    });
    const ids: BitIds = version.flattenedDependencies;
    const needsChange = ids.some((id) => id.scope !== remoteScope);
    if (needsChange) {
      version.flattenedDependencies = getBitIdsWithUpdatedScope(ids);
      hasChanged = true;
    }
    return hasChanged;
  }

  function changeExtensionsScope(version: Version): boolean {
    let hasChanged = false;
    version.extensions.forEach((ext) => {
      if (ext.extensionId) {
        const updatedScope = getIdWithUpdatedScope(ext.extensionId);
        if (!updatedScope.isEqual(ext.extensionId)) {
          hasChanged = true;
          ext.extensionId = updatedScope;
        }
      }
    });
    return hasChanged;
  }

  function getIdWithUpdatedScope(dependencyId: BitId): BitId {
    if (dependencyId.scope === remoteScope) {
      return dependencyId; // nothing has changed
    }
    if (!dependencyId.scope || exportingIds.hasWithoutVersion(dependencyId)) {
      const depId = ModelComponent.fromBitId(dependencyId);
      // todo: use 'load' for async and switch the foreach with map.
      const dependencyObject = scope.objects.loadSync(depId.hash());
      if (dependencyObject instanceof Symlink) {
        return dependencyId.changeScope(dependencyObject.realScope);
      }
      const currentlyExportedDep = idsWithFutureScope.searchWithoutScopeAndVersion(dependencyId);
      if (currentlyExportedDep && currentlyExportedDep.scope) {
        // it's possible that a dependency has a different defaultScope settings.
        return dependencyId.changeScope(currentlyExportedDep.scope);
      }
      return dependencyId.changeScope(remoteScope);
    }
    return dependencyId;
  }
  function getBitIdsWithUpdatedScope(bitIds: BitIds): BitIds {
    const updatedIds = bitIds.map((id) => getIdWithUpdatedScope(id));
    return BitIds.fromArray(updatedIds);
  }
}

async function validateRemotes(remotes: Remote[], clientId: string, isResumingExport = true) {
  loader.start('verifying that objects can be merged on the remotes...');
  try {
    await Promise.all(
      remotes.map((remote) =>
        remote.action(ExportValidate.name, {
          clientId,
          isResumingExport: true,
        })
      )
    );
  } catch (err) {
    logger.errorAndAddBreadCrumb('validateRemotes', 'failed validating remotes', {}, err);
    if (!isResumingExport) {
      // when resuming export, we don't want to delete the pending-objects because some scopes
      // have them persisted and some not. we want to persist to all failing scopes.
      await removePendingDirs(remotes, clientId);
    }
    throw err;
  }
}

async function persistRemotes(manyObjectsPerRemote: RemotesForPersist[], clientId: string) {
  const persistedRemotes: string[] = [];
  await mapSeries(manyObjectsPerRemote, async (objectsPerRemote: RemotesForPersist) => {
    const { remote } = objectsPerRemote;
    loader.start(`persisting data on the remote "${remote.name}"...`);
    const maxRetries = 3;
    let succeed = false;
    let lastErrMsg = '';
    for (let i = 0; i < maxRetries; i += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const exportedIds: string[] = await remote.action(ExportPersist.name, { clientId });
        objectsPerRemote.exportedIds = exportedIds;
        succeed = true;
        break;
      } catch (err) {
        lastErrMsg = err.message;
        logger.errorAndAddBreadCrumb(
          'persistRemotes',
          `failed on remote ${remote.name}, attempt ${i + 1} out of ${maxRetries}`,
          {},
          err
        );
      }
    }
    if (!succeed) {
      throw new PersistFailed([remote.name], { [remote.name]: lastErrMsg });
    }
    logger.debugAndAddBreadCrumb('persistRemotes', `successfully pushed all ids to the bare-scope ${remote.name}`);
    persistedRemotes.push(remote.name);
  });
}

export async function resumeExport(scope: Scope, exportId: string, remotes: string[]): Promise<string[]> {
  const scopeRemotes: Remotes = await getScopeRemotes(scope);
  const remotesObj = await Promise.all(remotes.map((r) => scopeRemotes.resolve(r, scope)));
  const remotesForPersist: RemotesForPersist[] = remotesObj.map((remote) => ({ remote }));
  await validateRemotes(remotesObj, exportId);
  await persistRemotes(remotesForPersist, exportId);
  return R.flatten(remotesForPersist.map((r) => r.exportedIds));
}

async function removePendingDirs(pushedRemotes: Remote[], clientId: string) {
  await Promise.all(pushedRemotes.map((remote) => remote.action(RemovePendingDir.name, { clientId })));
}
