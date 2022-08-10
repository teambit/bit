import mapSeries from 'p-map-series';
import R from 'ramda';
import { LaneId, DEFAULT_LANE } from '@teambit/lane-id';
import { BitId, BitIds } from '../../bit-id';
import { CENTRAL_BIT_HUB_NAME, CENTRAL_BIT_HUB_URL } from '../../constants';
import enrichContextFromGlobal from '../../hooks/utils/enrich-context-from-global';
import logger from '../../logger/logger';
import { Remote, Remotes } from '../../remotes';
import { ComponentNotFound, MergeConflict, MergeConflictOnRemote } from '../exceptions';
import ComponentNeedsUpdate from '../exceptions/component-needs-update';
import { Lane, ModelComponent, Symlink, Version, ExportMetadata } from '../models';
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
import { MergeResult } from '../repositories/sources';
import { ExportVersions } from '../models/export-metadata';

type ModelComponentAndObjects = { component: ModelComponent; objects: BitObject[] };

export type OnExportIdTransformer = (id: BitId) => BitId;
type UpdateDependenciesOnExportFunc = (version: Version, idTransformer: OnExportIdTransformer) => Version;

let updateDependenciesOnExport: UpdateDependenciesOnExportFunc;
export function registerUpdateDependenciesOnExport(func: UpdateDependenciesOnExportFunc) {
  updateDependenciesOnExport = func;
}

/**
 * ** Legacy and "bit sign" Only **
 *
 * @TODO there is no real difference between bare scope and a working directory scope - let's adjust terminology to avoid confusions in the future
 * saves a component into the objects directory of the remote scope, then, resolves its
 * dependencies, saves them as well. Finally runs the build process if needed on an isolated
 * environment.
 */
export async function exportManyBareScope(scope: Scope, objectList: ObjectList): Promise<BitIds> {
  logger.debugAndAddBreadCrumb('exportManyBareScope', `started with ${objectList.objects.length} objects`);
  const mergedIds: BitIds = await saveObjects(scope, objectList);
  logger.debugAndAddBreadCrumb('exportManyBareScope', 'will try to importMany in case there are missing dependencies');
  const scopeComponentsImporter = ScopeComponentsImporter.getInstance(scope);
  await scopeComponentsImporter.importManyFromOriginalScopes(mergedIds); // resolve dependencies
  logger.debugAndAddBreadCrumb('exportManyBareScope', 'successfully ran importMany');

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
  ids, // when exporting a lane, the ids are the lane component ids
  context = {},
  laneObject,
  allVersions,
  originDirectly,
  idsWithFutureScope,
  resumeExportId,
  ignoreMissingArtifacts,
}: {
  scope: Scope;
  ids: BitIds;
  context?: Record<string, any>;
  laneObject?: Lane;
  allVersions: boolean;
  originDirectly?: boolean;
  idsWithFutureScope: BitIds;
  resumeExportId?: string | undefined;
  ignoreMissingArtifacts?: boolean;
}): Promise<{ exported: BitIds; updatedLocally: BitIds; newIdsOnRemote: BitId[] }> {
  logger.debugAndAddBreadCrumb('scope.exportMany', 'ids: {ids}', { ids: ids.toString() });
  const scopeRemotes: Remotes = await getScopeRemotes(scope);
  const idsGroupedByScope = ids.toGroupByScopeName(idsWithFutureScope);
  await validateTargetScopeForLanes();
  const groupedByScopeString = Object.keys(idsGroupedByScope)
    .map((scopeName) => `scope "${scopeName}": ${idsGroupedByScope[scopeName].toString()}`)
    .join(', ');
  logger.debug(`export-scope-components, export to the following scopes ${groupedByScopeString}`);
  const exportVersions: ExportVersions[] = [];
  const manyObjectsPerRemote = laneObject
    ? [await getUpdatedObjectsToExport(laneObject.scope, ids, laneObject)]
    : await mapSeries(Object.keys(idsGroupedByScope), (scopeName) =>
        getUpdatedObjectsToExport(scopeName, idsGroupedByScope[scopeName], laneObject)
      );

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
  const results = await updateLocalObjects(laneObject);
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
    if (originDirectly) return false;
    const hubRemotes = manyObjectsPerRemote.filter((m) => scopeRemotes.isHub(m.remote.name));
    if (!hubRemotes.length) return false;
    if (hubRemotes.length === manyObjectsPerRemote.length) return true; // all are hub
    // @todo: maybe create a flag "no-central" to support this workflow
    throw new Error(
      `some of your components are configured to be exported to a local scope and some to the bit.cloud hub. this is not supported`
    );
  }

  async function getExportMetadata(): Promise<ObjectItem> {
    const exportMetadata = new ExportMetadata({ exportVersions });
    const exportMetadataObj = await exportMetadata.compress();
    const exportMetadataItem: ObjectItem = {
      ref: exportMetadata.hash(),
      buffer: exportMetadataObj,
      type: ExportMetadata.name,
    };
    return exportMetadataItem;
  }

  async function pushAllToCentralHub() {
    const objectList = transformToOneObjectListWithScopeData(manyObjectsPerRemote);
    objectList.addIfNotExist([await getExportMetadata()]);
    const http = await Http.connect(CENTRAL_BIT_HUB_URL, CENTRAL_BIT_HUB_NAME);
    const pushResults = await http.pushToCentralHub(objectList);
    const { failedScopes, successIds, errors } = pushResults;
    if (failedScopes.length) {
      throw new PersistFailed(failedScopes, errors);
    }
    const exportedBitIds = successIds.map((id) => BitId.parse(id, true));
    if (manyObjectsPerRemote.length === 1) {
      // when on a lane, it's always exported to the lane. and the ids can be from different scopes, so having the
      // filter below, will remove these components from the output of bit-export at the end.
      manyObjectsPerRemote[0].exportedIds = exportedBitIds.map((id) => id.toString());
    } else {
      manyObjectsPerRemote.forEach((objectPerRemote) => {
        const idsPerScope = exportedBitIds.filter((id) => id.scope === objectPerRemote.remote.name);
        // it's possible that idsPerScope is an empty array, in case the objects were exported already before
        objectPerRemote.exportedIds = idsPerScope.map((id) => id.toString());
      });
    }
  }

  /**
   * when a component is exported for the first time, and the lane-scope is not the same as the component-scope, it's
   * important to validate that there is no such component in the original scope. otherwise, later, it'll be impossible
   * to merge the lane because these two components don't have any snap in common.
   */
  async function validateTargetScopeForLanes() {
    if (!laneObject) {
      return;
    }
    const newIds = BitIds.fromArray(ids.filter((id) => !id.hasScope()));
    const newIdsGrouped = newIds.toGroupByScopeName(idsWithFutureScope);
    await mapSeries(Object.keys(newIdsGrouped), async (scopeName) => {
      if (scopeName === laneObject.scope) {
        // this validation is redundant if the lane-component is in the same scope as the lane-object
        return;
      }
      // by getting the remote we also validate that this scope actually exists.
      const remote = await scopeRemotes.resolve(scopeName, scope);
      const list = await remote.list();
      const listIds = BitIds.fromArray(list.map((listItem) => listItem.id));
      newIdsGrouped[scopeName].forEach((id) => {
        if (listIds.hasWithoutScopeAndVersion(id)) {
          throw new Error(`unable to export a lane with a new component "${id.toString()}", which has the default-scope "${scopeName}".
this scope already has a component with the same name. as such, it'll be impossible to merge the lane later because these two components are different`);
        }
      });
    });
  }

  async function getUpdatedObjectsToExport(
    remoteNameStr: string,
    bitIds: BitIds,
    lane?: Lane
  ): Promise<ObjectsPerRemote> {
    bitIds.throwForDuplicationIgnoreVersion();
    const remote: Remote = await scopeRemotes.resolve(remoteNameStr, scope);
    const idsToChangeLocally = BitIds.fromArray(bitIds.filter((id) => !id.scope || id.scope === remoteNameStr));
    const componentsAndObjects: ModelComponentAndObjects[] = [];
    const objectList = new ObjectList();
    const objectListPerName: ObjectListPerName = {};
    const processModelComponent = async (modelComponent: ModelComponent) => {
      const versionToExport = await getVersionsToExport(modelComponent, lane);
      modelComponent.clearStateData();
      const objectItems = await modelComponent.collectVersionsObjects(
        scope.objects,
        versionToExport,
        ignoreMissingArtifacts
      );
      const objectsList = await new ObjectList(objectItems).toBitObjects();
      const componentAndObject = { component: modelComponent, objects: objectsList.getAll() };
      await convertToCorrectScopeHarmony(scope, componentAndObject, remoteNameStr, bitIds, idsWithFutureScope);
      populateExportMetadata(modelComponent);
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
    if (lane) {
      lane.components.forEach((c) => {
        const idWithFutureScope = idsWithFutureScope.searchWithoutScopeAndVersion(c.id);
        c.id = c.id.hasScope() ? c.id : c.id.changeScope(idWithFutureScope?.scope || lane.scope);
      });
      if (lane.readmeComponent) {
        lane.readmeComponent.id = lane.readmeComponent.id.hasScope()
          ? lane.readmeComponent.id
          : lane.readmeComponent.id.changeScope(lane.scope);
      }
      const laneData = { ref: lane.hash(), buffer: await lane.compress() };
      objectList.addIfNotExist([laneData]);
    }

    return { remote, objectList, objectListPerName, idsToChangeLocally, componentsAndObjects };
  }

  function populateExportMetadata(modelComponent: ModelComponent) {
    const localTagsOrHashes = modelComponent.getLocalTagsOrHashes();
    const head = modelComponent.getHeadRegardlessOfLane();
    if (!head) {
      throw new Error(`unable to export ${modelComponent.id()}, head is missing`);
    }
    exportVersions.push({
      id: modelComponent.toBitId(),
      versions: localTagsOrHashes,
      head,
    });
  }

  async function getVersionsToExport(modelComponent: ModelComponent, lane?: Lane): Promise<string[]> {
    await modelComponent.setDivergeData(scope.objects);
    const localTagsOrHashes = modelComponent.getLocalTagsOrHashes();
    if (!allVersions && !lane) {
      // if lane is exported, components from other remotes may be exported to this remote. we need their history.
      return localTagsOrHashes;
    }
    const allHashes = await getAllVersionHashes(modelComponent, scope.objects, true);
    await addMainHeadIfPossible(allHashes, modelComponent);
    return modelComponent.switchHashesWithTagsIfExist(allHashes);
  }

  /**
   * by default, when exporting a lane, it traverse from the Lane's head and therefore it may skip the main head.
   * later, if for some reason the original component was deleted in its scope, the head object will be missing.
   */
  async function addMainHeadIfPossible(allHashes: Ref[], modelComponent: ModelComponent) {
    const head = modelComponent.head;
    if (!head) return;
    if (allHashes.find((h) => h.hash === head.hash)) return; // head is already in the list
    if (!(await scope.objects.has(head))) return; // it should not happen. but if it does, we don't want to block the export
    allHashes.push(head);
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
      } catch (err: any) {
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
      } catch (err: any) {
        logger.warnAndAddBreadCrumb('exportMany', 'failed pushing objects to the remote');
        await removePendingDirs(pushedRemotes, clientId);
        throw err;
      }
    });
  }

  async function updateLocalObjects(
    lane?: Lane
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
      idsToChangeLocally.forEach((id) => {
        scope.createSymlink(id, idsWithFutureScope.searchWithoutScopeAndVersion(id)?.scope || remoteNameStr);
      });
      componentsAndObjects.forEach((componentObject) => scope.sources.put(componentObject));

      // update lanes
      if (lane) {
        if (idsToChangeLocally.length) {
          // otherwise, we don't want to update scope-name of components in the lane object
          scope.objects.add(lane);
        }
        await scope.objects.remoteLanes.syncWithLaneObject(remoteNameStr, lane);
      }

      if (scope.lanes.isOnMain() && !lane) {
        // all exported from main
        const remoteLaneId = LaneId.from(DEFAULT_LANE, remoteNameStr);
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
}

/**
 * save objects into the scope.
 */
export async function saveObjects(scope: Scope, objectList: ObjectList): Promise<BitIds> {
  const bitObjectList = await objectList.toBitObjects();
  const objectsNotRequireMerge = bitObjectList.getObjectsNotRequireMerge();
  // components and lanes can't be just added, they need to be carefully merged.
  const { mergedIds, mergedComponentsResults, mergedLanes } = await mergeObjects(scope, objectList);

  const mergedComponents = mergedComponentsResults.map((_) => _.mergedComponent);
  const allObjects = [...mergedComponents, ...mergedLanes, ...objectsNotRequireMerge];
  scope.objects.validateObjects(true, allObjects);
  await scope.objects.writeObjectsToTheFS(allObjects);
  logger.debugAndAddBreadCrumb('exportManyBareScope', 'objects were written successfully to the filesystem');

  return mergedIds;
}

type MergeObjectsResult = { mergedIds: BitIds; mergedComponentsResults: MergeResult[]; mergedLanes: Lane[] };

/**
 * merge components into the scope.
 *
 * a component might have multiple versions that some where merged and some were not.
 * the BitIds returned here includes the versions that were merged. so it could contain multiple
 * ids of the same component with different versions
 */
export async function mergeObjects(
  scope: Scope,
  objectList: ObjectList,
  throwForMissingDeps = false
): Promise<MergeObjectsResult> {
  const bitObjectList = await objectList.toBitObjects();
  const components = bitObjectList.getComponents();
  const lanesObjects = bitObjectList.getLanes();
  const versions = bitObjectList.getVersions();
  logger.debugAndAddBreadCrumb(
    'export-scope-components.mergeObjects',
    `Going to merge ${components.length} components, ${lanesObjects.length} lanes`
  );
  const { mergeResults, errors } = lanesObjects.length
    ? { mergeResults: [], errors: [] } // for lanes, no need to merge component objects, the lane is merged later.
    : await scope.sources.mergeComponents(components, versions);

  // add all objects to the cache, it is needed for lanes later on. also it might be
  // good regardless to update the cache with the new data.
  [...components, ...versions].forEach((bitObject) => scope.objects.setCache(bitObject));

  const mergeAllLanesResults = await mapSeries(lanesObjects, (laneObject) =>
    scope.sources.mergeLane(laneObject, false)
  );
  const lanesErrors = mergeAllLanesResults.map((r) => r.mergeErrors).flat();
  const componentsNeedUpdate = [
    ...errors.filter((result) => result instanceof ComponentNeedsUpdate),
    ...lanesErrors,
  ] as ComponentNeedsUpdate[];
  const componentsWithConflicts = errors.filter((result) => result instanceof MergeConflict) as MergeConflict[];
  if (componentsWithConflicts.length || componentsNeedUpdate.length) {
    const idsAndVersions = componentsWithConflicts.map((c) => ({ id: c.id, versions: c.versions }));
    const idsAndVersionsWithConflicts = R.sortBy(R.prop('id'), idsAndVersions);
    const idsOfNeedUpdateComps = R.sortBy(
      R.prop('id'),
      componentsNeedUpdate.map((c) => ({ id: c.id, lane: c.lane }))
    );
    scope.objects.clearCache(); // just in case this error is caught. we don't want to persist anything by mistake.
    throw new MergeConflictOnRemote(idsAndVersionsWithConflicts, idsOfNeedUpdateComps);
  }
  if (throwForMissingDeps) await throwForMissingLocalDependencies(scope, versions);
  const mergedComponents = mergeResults.filter(({ mergedVersions }) => mergedVersions.length);
  const mergedLanesComponents = mergeAllLanesResults
    .map((r) => r.mergeResults)
    .flat()
    .filter(({ mergedVersions }) => mergedVersions.length);
  const mergedComponentsResults = [...mergedComponents, ...mergedLanesComponents];
  const getMergedIds = ({ mergedComponent, mergedVersions }): BitId[] =>
    mergedVersions.map((version) => mergedComponent.toBitId().changeVersion(version));
  const mergedIds = BitIds.uniqFromArray(mergedComponentsResults.map(getMergedIds).flat());
  const mergedLanes = mergeAllLanesResults.map((r) => r.mergeLane);

  return { mergedIds, mergedComponentsResults, mergedLanes };
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
          if (!objectExist) {
            scope.objects.clearCache(); // just in case this error is caught. we don't want to persist anything by mistake.
            throw new ComponentNotFound(depId.toString());
          }
        })
      );
    })
  );
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
  idsWithFutureScope: BitIds,
  shouldFork = false // not in used currently, but might be needed soon
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
  const shouldChangeScope = shouldFork
    ? remoteScope !== componentsObjects.component.scope
    : !componentsObjects.component.scope;
  const hasComponentChanged = shouldChangeScope;
  if (shouldChangeScope) {
    const idWithFutureScope = idsWithFutureScope.searchWithoutScopeAndVersion(componentsObjects.component.toBitId());
    componentsObjects.component.scope = idWithFutureScope?.scope || remoteScope;
  }

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
    // either, dependencyId is new, or this dependency is among the components to export (in case of fork)
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
  } catch (err: any) {
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
      } catch (err: any) {
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
