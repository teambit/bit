import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import ScopeAspect, { ScopeMain } from '@teambit/scope';
import R from 'ramda';
import { BitError } from '@teambit/bit-error';
import { Analytics } from '@teambit/legacy/dist/analytics/analytics';
import { BitId, BitIds } from '@teambit/legacy/dist/bit-id';
import loader from '@teambit/legacy/dist/cli/loader';
import {
  BEFORE_EXPORT,
  BEFORE_EXPORTS,
  BEFORE_LOADING_COMPONENTS,
} from '@teambit/legacy/dist/cli/loader/loader-messages';
import {
  CENTRAL_BIT_HUB_NAME,
  CENTRAL_BIT_HUB_URL,
  POST_EXPORT_HOOK,
  PRE_EXPORT_HOOK,
} from '@teambit/legacy/dist/constants';
import { Consumer, loadConsumer } from '@teambit/legacy/dist/consumer';
import BitMap from '@teambit/legacy/dist/consumer/bit-map/bit-map';
import EjectComponents, { EjectResults } from '@teambit/legacy/dist/consumer/component-ops/eject-components';
import ComponentsList from '@teambit/legacy/dist/consumer/component/components-list';
import GeneralError from '@teambit/legacy/dist/error/general-error';
import HooksManager from '@teambit/legacy/dist/hooks';
import { RemoveAspect, RemoveMain } from '@teambit/remove';
import { NodeModuleLinker } from '@teambit/legacy/dist/links';
import logger from '@teambit/legacy/dist/logger/logger';
import { Lane, ModelComponent, Symlink, Version, ExportMetadata } from '@teambit/legacy/dist/scope/models';
import hasWildcard from '@teambit/legacy/dist/utils/string/has-wildcard';
import { Scope } from '@teambit/legacy/dist/scope';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import { ConsumerNotFound } from '@teambit/legacy/dist/consumer/exceptions';
import { LaneReadmeComponent } from '@teambit/legacy/dist/scope/models/lane';
import { Http } from '@teambit/legacy/dist/scope/network/http';
import { ObjectList, ObjectItem } from '@teambit/legacy/dist/scope/objects/object-list';
import mapSeries from 'p-map-series';
import { LaneId, DEFAULT_LANE } from '@teambit/lane-id';
import { Remote, Remotes } from '@teambit/legacy/dist/remotes';
import { getScopeRemotes } from '@teambit/legacy/dist/scope/scope-remotes';
import { DependencyResolverAspect, DependencyResolverMain } from '@teambit/dependency-resolver';
import { ExportVersions } from '@teambit/legacy/dist/scope/models/export-metadata';
import {
  persistRemotes,
  validateRemotes,
  removePendingDirs,
} from '@teambit/legacy/dist/scope/component-ops/export-scope-components';
import { BitObject, Ref } from '@teambit/legacy/dist/scope/objects';
import { PersistFailed } from '@teambit/legacy/dist/scope/exceptions/persist-failed';
import { getAllVersionHashes } from '@teambit/legacy/dist/scope/component-ops/traverse-versions';
import { ExportAspect } from './export.aspect';
import { ExportCmd } from './export-cmd';
import { ResumeExportCmd } from './resume-export-cmd';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';

const HooksManagerInstance = HooksManager.getInstance();

export type OnExportIdTransformer = (id: BitId) => BitId;

type ModelComponentAndObjects = { component: ModelComponent; objects: BitObject[] };
type ObjectListPerName = { [name: string]: ObjectList };
type ObjectsPerRemote = {
  remote: Remote;
  objectList: ObjectList;
  exportedIds?: string[];
};
type ObjectsPerRemoteExtended = ObjectsPerRemote & {
  objectListPerName: ObjectListPerName;
  idsToChangeLocally: BitIds;
  componentsAndObjects: ModelComponentAndObjects[];
};

type ExportParams = {
  ids: string[];
  eject: boolean;
  allVersions: boolean;
  originDirectly: boolean;
  includeNonStaged: boolean;
  resumeExportId: string | undefined;
  ignoreMissingArtifacts: boolean;
};

export class ExportMain {
  constructor(
    private workspace: Workspace,
    private remove: RemoveMain,
    private depResolver: DependencyResolverMain,
    private logger: Logger
  ) {}

  async export(params: ExportParams) {
    HooksManagerInstance.triggerHook(PRE_EXPORT_HOOK, params);
    const { updatedIds, nonExistOnBitMap, missingScope, exported, removedIds, exportedLanes } =
      await this.exportComponents(params);
    let ejectResults;
    if (params.eject) ejectResults = await ejectExportedComponents(updatedIds);
    const exportResults = {
      componentsIds: exported,
      nonExistOnBitMap,
      removedIds,
      missingScope,
      ejectResults,
      exportedLanes,
    };
    HooksManagerInstance.triggerHook(POST_EXPORT_HOOK, exportResults);
    if (Scope.onPostExport) {
      await Scope.onPostExport(exported, exportedLanes).catch((err) => {
        logger.error('fatal: onPostExport encountered an error (this error does not stop the process)', err);
      });
    }
    return exportResults;
  }

  async exportObjectList(
    manyObjectsPerRemote: ObjectsPerRemote[],
    scopeRemotes: Remotes,
    centralHubOptions?: Record<string, any>
  ) {
    const http = await Http.connect(CENTRAL_BIT_HUB_URL, CENTRAL_BIT_HUB_NAME);
    if (this.shouldPushToCentralHub(manyObjectsPerRemote, scopeRemotes)) {
      const objectList = this.transformToOneObjectListWithScopeData(manyObjectsPerRemote);
      await http.pushToCentralHub(objectList, centralHubOptions);
    } else {
      await this.pushToRemotesCarefully(manyObjectsPerRemote);
    }
  }

  private async exportComponents({ ids, includeNonStaged, originDirectly, ...params }: ExportParams): Promise<{
    updatedIds: BitId[];
    nonExistOnBitMap: BitId[];
    removedIds: BitIds;
    missingScope: BitId[];
    exported: BitId[];
    exportedLanes: Lane[];
    newIdsOnRemote: BitId[];
  }> {
    if (!this.workspace) throw new ConsumerNotFound();
    const consumer: Consumer = this.workspace.consumer;
    const { idsToExport, missingScope, idsWithFutureScope, laneObject } = await this.getComponentsToExport(
      ids,
      includeNonStaged
    );

    if (R.isEmpty(idsToExport)) {
      return {
        updatedIds: [],
        nonExistOnBitMap: [],
        removedIds: new BitIds(),
        missingScope,
        exported: [],
        newIdsOnRemote: [],
        exportedLanes: [],
      };
    }

    // validate lane readme component and ensure it has been snapped
    if (laneObject?.readmeComponent) {
      _throwForUnsnappedLaneReadme(laneObject);
    }
    const isOnMain = consumer.isOnMain();
    const { exported, updatedLocally, newIdsOnRemote } = await this.exportMany({
      ...params,
      scope: consumer.scope,
      ids: idsToExport,
      laneObject,
      originDirectly,
      idsWithFutureScope,
      isOnMain,
    });
    if (laneObject) await updateLanesAfterExport(consumer, laneObject);
    const removedIds = await this.getRemovedStagedBitIds();
    const { updatedIds, nonExistOnBitMap } = _updateIdsOnBitMap(consumer.bitMap, updatedLocally);
    await this.removeFromStagedConfig([...updatedIds, ...nonExistOnBitMap]);
    await linkComponents(updatedIds, consumer);
    Analytics.setExtraData('num_components', exported.length);
    // it is important to have consumer.onDestroy() before running the eject operation, we want the
    // export and eject operations to function independently. we don't want to lose the changes to
    // .bitmap file done by the export action in case the eject action has failed.
    await consumer.onDestroy();
    return {
      updatedIds,
      nonExistOnBitMap: nonExistOnBitMap.filter((id) => !removedIds.hasWithoutVersion(id)),
      removedIds,
      missingScope,
      exported,
      newIdsOnRemote,
      exportedLanes: laneObject ? [laneObject] : [],
    };
  }

  /**
   * the export process uses four steps. read more about it here: https://github.com/teambit/bit/pull/3371
   */
  async exportMany({
    scope,
    ids, // when exporting a lane, the ids are the lane component ids
    laneObject,
    allVersions,
    originDirectly,
    idsWithFutureScope,
    resumeExportId,
    ignoreMissingArtifacts,
    isOnMain = true,
    exportHeadsOnly, // relevant when exporting from bare-scope, especially when re-exporting existing versions, the normal calculation based on getDivergeData won't work
  }: {
    scope: Scope;
    ids: BitIds;
    laneObject?: Lane;
    allVersions: boolean;
    originDirectly?: boolean;
    idsWithFutureScope: BitIds;
    resumeExportId?: string | undefined;
    ignoreMissingArtifacts?: boolean;
    isOnMain?: boolean;
    exportHeadsOnly?: boolean;
  }): Promise<{ exported: BitIds; updatedLocally: BitIds; newIdsOnRemote: BitId[] }> {
    logger.debugAndAddBreadCrumb('scope.exportMany', 'ids: {ids}', { ids: ids.toString() });
    const scopeRemotes: Remotes = await getScopeRemotes(scope);
    const idsGroupedByScope = ids.toGroupByScopeName(idsWithFutureScope);

    /**
     * when a component is exported for the first time, and the lane-scope is not the same as the component-scope, it's
     * important to validate that there is no such component in the original scope. otherwise, later, it'll be impossible
     * to merge the lane because these two components don't have any snap in common.
     */
    const validateTargetScopeForLanes = async () => {
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
    };

    /**
     * by default, when exporting a lane, it traverse from the Lane's head and therefore it may skip the main head.
     * later, if for some reason the original component was deleted in its scope, the head object will be missing.
     */
    const addMainHeadIfPossible = async (allHashes: Ref[], modelComponent: ModelComponent) => {
      const head = modelComponent.head;
      if (!head) return;
      if (allHashes.find((h) => h.hash === head.hash)) return; // head is already in the list
      if (!(await scope.objects.has(head))) return; // it should not happen. but if it does, we don't want to block the export
      allHashes.push(head);
    };

    const getVersionsToExport = async (modelComponent: ModelComponent): Promise<string[]> => {
      if (exportHeadsOnly) {
        const head = modelComponent.head;
        if (!head)
          throw new Error(
            `getVersionsToExport should export the head only, but the head of ${modelComponent.id()} is missing`
          );
        return modelComponent.switchHashesWithTagsIfExist([head]);
      }
      const localTagsOrHashes = await modelComponent.getLocalTagsOrHashes(scope.objects);
      if (!allVersions) {
        return localTagsOrHashes;
      }

      const allHashes = await getAllVersionHashes({ modelComponent, repo: scope.objects });
      await addMainHeadIfPossible(allHashes, modelComponent);
      return modelComponent.switchHashesWithTagsIfExist(allHashes);
    };

    await validateTargetScopeForLanes();
    const groupedByScopeString = Object.keys(idsGroupedByScope)
      .map((scopeName) => `scope "${scopeName}": ${idsGroupedByScope[scopeName].toString()}`)
      .join(', ');
    logger.debug(`export-scope-components, export to the following scopes ${groupedByScopeString}`);
    const exportVersions: ExportVersions[] = [];

    const populateExportMetadata = async (modelComponent: ModelComponent) => {
      const localTagsOrHashes = await modelComponent.getLocalTagsOrHashes(scope.objects);
      const head = modelComponent.getHeadRegardlessOfLane();
      if (!head) {
        throw new Error(`unable to export ${modelComponent.id()}, head is missing`);
      }
      exportVersions.push({
        id: modelComponent.toBitId(),
        versions: localTagsOrHashes,
        head,
      });
    };

    const getUpdatedObjectsToExport = async (
      remoteNameStr: string,
      bitIds: BitIds,
      lane?: Lane
    ): Promise<ObjectsPerRemoteExtended> => {
      bitIds.throwForDuplicationIgnoreVersion();
      const remote: Remote = await scopeRemotes.resolve(remoteNameStr, scope);
      const idsToChangeLocally = BitIds.fromArray(bitIds.filter((id) => !id.scope || id.scope === remoteNameStr));
      const componentsAndObjects: ModelComponentAndObjects[] = [];
      const objectList = new ObjectList();
      const objectListPerName: ObjectListPerName = {};
      const processModelComponent = async (modelComponent: ModelComponent) => {
        const versionToExport = await getVersionsToExport(modelComponent);
        modelComponent.clearStateData();
        const objectItems = await modelComponent.collectVersionsObjects(
          scope.objects,
          versionToExport,
          ignoreMissingArtifacts
        );
        const objectsList = await new ObjectList(objectItems).toBitObjects();
        const componentAndObject = { component: modelComponent, objects: objectsList.getAll() };
        await this.convertToCorrectScopeHarmony(scope, componentAndObject, remoteNameStr, bitIds, idsWithFutureScope);
        await populateExportMetadata(modelComponent);
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
    };

    const manyObjectsPerRemote = laneObject
      ? [await getUpdatedObjectsToExport(laneObject.scope, ids, laneObject)]
      : await mapSeries(Object.keys(idsGroupedByScope), (scopeName) =>
          getUpdatedObjectsToExport(scopeName, idsGroupedByScope[scopeName], laneObject)
        );

    const getExportMetadata = async (): Promise<ObjectItem> => {
      const exportMetadata = new ExportMetadata({ exportVersions });
      const exportMetadataObj = await exportMetadata.compress();
      const exportMetadataItem: ObjectItem = {
        ref: exportMetadata.hash(),
        buffer: exportMetadataObj,
        type: ExportMetadata.name,
      };
      return exportMetadataItem;
    };

    const pushAllToCentralHub = async () => {
      const objectList = this.transformToOneObjectListWithScopeData(manyObjectsPerRemote);
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
    };

    const updateLocalObjects = async (
      lane?: Lane
    ): Promise<Array<{ exported: BitIds; updatedLocally: BitIds; newIdsOnRemote: BitId[] }>> => {
      return mapSeries(manyObjectsPerRemote, async (objectsPerRemote: ObjectsPerRemoteExtended) => {
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

        if (isOnMain && !lane) {
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
    };

    if (resumeExportId) {
      const remotes = manyObjectsPerRemote.map((o) => o.remote);
      await validateRemotes(remotes, resumeExportId);
      await persistRemotes(manyObjectsPerRemote, resumeExportId);
    } else if (this.shouldPushToCentralHub(manyObjectsPerRemote, scopeRemotes, originDirectly)) {
      await pushAllToCentralHub();
    } else {
      // await pushToRemotes();
      await this.pushToRemotesCarefully(manyObjectsPerRemote, resumeExportId);
    }

    loader.start('updating data locally...');
    const results = await updateLocalObjects(laneObject);
    return {
      newIdsOnRemote: R.flatten(results.map((r) => r.newIdsOnRemote)),
      exported: BitIds.uniqFromArray(R.flatten(results.map((r) => r.exported))),
      updatedLocally: BitIds.uniqFromArray(R.flatten(results.map((r) => r.updatedLocally))),
    };
  }

  private transformToOneObjectListWithScopeData(objectsPerRemote: ObjectsPerRemote[]): ObjectList {
    const objectList = new ObjectList();
    objectsPerRemote.forEach((objPerRemote) => {
      objPerRemote.objectList.addScopeName(objPerRemote.remote.name);
      objectList.mergeObjectList(objPerRemote.objectList);
    });
    return objectList;
  }

  private async pushToRemotesCarefully(manyObjectsPerRemote: ObjectsPerRemote[], resumeExportId?: string) {
    const remotes = manyObjectsPerRemote.map((o) => o.remote);
    const clientId = resumeExportId || Date.now().toString();
    await this.pushRemotesPendingDir(clientId, manyObjectsPerRemote, resumeExportId);
    await validateRemotes(remotes, clientId, Boolean(resumeExportId));
    await persistRemotes(manyObjectsPerRemote, clientId);
  }

  private async pushRemotesPendingDir(
    clientId: string,
    manyObjectsPerRemote: ObjectsPerRemote[],
    resumeExportId?: string
  ): Promise<void> {
    if (resumeExportId) {
      logger.debug('pushRemotesPendingDir - skip as the resumeExportId was passed');
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
        await remote.pushMany(objectList, pushOptions, {});
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

  private shouldPushToCentralHub(
    manyObjectsPerRemote: ObjectsPerRemote[],
    scopeRemotes: Remotes,
    originDirectly = false
  ): boolean {
    if (originDirectly) return false;
    const hubRemotes = manyObjectsPerRemote.filter((m) => scopeRemotes.isHub(m.remote.name));
    if (!hubRemotes.length) return false;
    if (hubRemotes.length === manyObjectsPerRemote.length) return true; // all are hub
    // @todo: maybe create a flag "no-central" to support this workflow
    throw new BitError(
      `some of your components are configured to be exported to a local scope and some to the bit.cloud hub. this is not supported`
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
  private async convertToCorrectScopeHarmony(
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
        this.depResolver.updateDepsOnLegacyExport(objectVersion, getIdWithUpdatedScope.bind(this));

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
        version.flattenedEdges = version.flattenedEdges.map((edge) => ({
          ...edge,
          source: getIdWithUpdatedScope(edge.source),
          target: getIdWithUpdatedScope(edge.target),
        }));
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

  private async removeFromStagedConfig(ids: BitId[]) {
    this.logger.debug(`removeFromStagedConfig, ${ids.length} ids`);
    const componentIds = await this.workspace.resolveMultipleComponentIds(ids);
    const stagedConfig = await this.workspace.scope.getStagedConfig();
    componentIds.map((compId) => stagedConfig.removeComponentConfig(compId));
    await stagedConfig.write();
  }

  private async getComponentsToExport(
    ids: string[],
    includeNonStaged: boolean
  ): Promise<{ idsToExport: BitIds; missingScope: BitId[]; idsWithFutureScope: BitIds; laneObject?: Lane }> {
    const consumer = this.workspace.consumer;
    const componentsList = new ComponentsList(consumer);
    const idsHaveWildcard = hasWildcard(ids);
    const filterNonScopeIfNeeded = async (
      bitIds: BitIds
    ): Promise<{ idsToExport: BitIds; missingScope: BitId[]; idsWithFutureScope: BitIds }> => {
      const idsWithFutureScope = await this.getIdsWithFutureScope(bitIds);
      const [idsToExport, missingScope] = R.partition((id) => {
        const idWithFutureScope = idsWithFutureScope.searchWithoutScopeAndVersion(id);
        if (!idWithFutureScope) throw new Error(`idsWithFutureScope is missing ${id.toString()}`);
        return idWithFutureScope.hasScope();
      }, bitIds);
      return { idsToExport: BitIds.fromArray(idsToExport), missingScope, idsWithFutureScope };
    };
    if (isUserTryingToExportLanes(consumer)) {
      if (ids.length) {
        throw new GeneralError(`when checked out to a lane, all its components are exported. please omit the ids`);
      }
      const { componentsToExport, laneObject } = await this.getLaneCompIdsToExport(consumer, includeNonStaged);
      const loaderMsg = componentsToExport.length > 1 ? BEFORE_EXPORTS : BEFORE_EXPORT;
      loader.start(loaderMsg);
      const filtered = await filterNonScopeIfNeeded(componentsToExport);
      return { ...filtered, laneObject };
    }
    if (!ids.length || idsHaveWildcard) {
      loader.start(BEFORE_LOADING_COMPONENTS);
      const exportPendingComponents: BitIds = includeNonStaged
        ? await componentsList.listNonNewComponentsIds()
        : await componentsList.listExportPendingComponentsIds();
      const componentsToExport = idsHaveWildcard
        ? ComponentsList.filterComponentsByWildcard(exportPendingComponents, ids)
        : exportPendingComponents;
      const loaderMsg = componentsToExport.length > 1 ? BEFORE_EXPORTS : BEFORE_EXPORT;
      loader.start(loaderMsg);
      return filterNonScopeIfNeeded(componentsToExport);
    }
    loader.start(BEFORE_EXPORT); // show single export
    const parsedIds = await Promise.all(ids.map((id) => getParsedId(consumer, id)));
    const statuses = await consumer.getManyComponentsStatuses(parsedIds);
    statuses.forEach(({ id, status }) => {
      if (status.nested) {
        throw new GeneralError(
          `unable to export "${id.toString()}", the component is not fully available. please use "bit import" first`
        );
      }
    });
    return filterNonScopeIfNeeded(BitIds.fromArray(parsedIds));
  }

  private async getIdsWithFutureScope(ids: BitIds): Promise<BitIds> {
    const idsArrayP = ids.map(async (id) => {
      if (id.hasScope()) return id;
      const componentId = await this.workspace.resolveComponentId(id);
      const finalScope = await this.workspace.componentDefaultScope(componentId);
      if (finalScope) {
        return id.changeScope(finalScope);
      }
      return id;
    });
    const idsArray = await Promise.all(idsArrayP);
    return BitIds.fromArray(idsArray);
  }

  private async getLaneCompIdsToExport(
    consumer: Consumer,
    includeNonStaged: boolean
  ): Promise<{ componentsToExport: BitIds; laneObject: Lane }> {
    const currentLaneId = consumer.getCurrentLaneId();
    const laneObject = await consumer.scope.loadLane(currentLaneId);
    if (!laneObject) {
      throw new Error(`fatal: unable to load the current lane object (${currentLaneId.toString()})`);
    }
    loader.start(BEFORE_LOADING_COMPONENTS);
    const componentsList = new ComponentsList(consumer);
    const componentsToExportWithoutRemoved = includeNonStaged
      ? await componentsList.listNonNewComponentsIds()
      : await componentsList.listExportPendingComponentsIds(laneObject);
    const removedStagedBitIds = await this.getRemovedStagedBitIds();
    const componentsToExport = BitIds.uniqFromArray([...componentsToExportWithoutRemoved, ...removedStagedBitIds]);
    return { componentsToExport, laneObject };
  }

  private async getRemovedStagedBitIds(): Promise<BitIds> {
    const removedStaged = await this.remove.getRemovedStaged();
    return BitIds.fromArray(removedStaged.map((r) => r._legacy).map((id) => id.changeVersion(undefined)));
  }

  static runtime = MainRuntime;
  static dependencies = [CLIAspect, ScopeAspect, WorkspaceAspect, RemoveAspect, DependencyResolverAspect, LoggerAspect];
  static async provider([cli, scope, workspace, remove, depResolver, loggerMain]: [
    CLIMain,
    ScopeMain,
    Workspace,
    RemoveMain,
    DependencyResolverMain,
    LoggerMain
  ]) {
    const logger = loggerMain.createLogger(ExportAspect.id);
    const exportMain = new ExportMain(workspace, remove, depResolver, logger);
    cli.register(new ResumeExportCmd(scope), new ExportCmd(exportMain));
    return exportMain;
  }
}

ExportAspect.addRuntime(ExportMain);

function _updateIdsOnBitMap(bitMap: BitMap, componentsIds: BitIds): { updatedIds: BitId[]; nonExistOnBitMap: BitIds } {
  const updatedIds = [];
  const nonExistOnBitMap = new BitIds();
  componentsIds.forEach((componentsId) => {
    const resultId = bitMap.updateComponentId(componentsId, true);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    if (resultId.hasVersion()) updatedIds.push(resultId);
    else nonExistOnBitMap.push(resultId);
  });
  return { updatedIds, nonExistOnBitMap };
}

async function getParsedId(consumer: Consumer, id: string): Promise<BitId> {
  // reason why not calling `consumer.getParsedId()` first is because a component might not be on
  // .bitmap and only in the scope. we support this case and enable to export
  const parsedId: BitId = await consumer.scope.getParsedId(id);
  if (parsedId.hasScope()) return parsedId;
  // parsing id from the scope, doesn't provide the scope-name in case it's missing, in this case
  // get the id including the scope from the consumer.
  try {
    return consumer.getParsedId(id);
  } catch (err: any) {
    // not in the consumer, just return the one parsed without the scope name
    return parsedId;
  }
}

async function linkComponents(ids: BitId[], consumer: Consumer): Promise<void> {
  // we don't have much of a choice here, we have to load all the exported components in order to link them
  // some of the components might be authored, some might be imported.
  // when a component has dists, we need the consumer-component object to retrieve the dists info.
  const components = await Promise.all(ids.map((id) => consumer.loadComponentFromModel(id)));
  const nodeModuleLinker = new NodeModuleLinker(components, consumer, consumer.bitMap);
  await nodeModuleLinker.link();
}

async function ejectExportedComponents(componentsIds): Promise<EjectResults> {
  const consumer: Consumer = await loadConsumer(undefined, true);
  let ejectResults: EjectResults;
  try {
    const ejectComponents = new EjectComponents(consumer, componentsIds);
    ejectResults = await ejectComponents.eject();
  } catch (err: any) {
    const ejectErr = `The components ${componentsIds.map((c) => c.toString()).join(', ')} were exported successfully.
    However, the eject operation has failed due to an error: ${err.msg || err}`;
    logger.error(ejectErr, err);
    throw new Error(ejectErr);
  }
  // run the consumer.onDestroy() again, to write the changes done by the eject action to .bitmap
  await consumer.onDestroy();
  return ejectResults;
}

function _throwForUnsnappedLaneReadme(lane: Lane) {
  const readmeComponent = lane.readmeComponent as LaneReadmeComponent;

  const isValid =
    readmeComponent?.head &&
    lane.getComponent(readmeComponent.id) &&
    lane.getComponentHead(readmeComponent.id)?.isEqual(readmeComponent?.head);

  if (!isValid) {
    throw new BitError(
      `${lane?.name} has a readme component ${readmeComponent.id} that hasn't been snapped on the lane.
      Please run either snap -a or snap ${readmeComponent.id} to snap the component on the lane before exporting it.`
    );
  }
}

async function updateLanesAfterExport(consumer: Consumer, lane: Lane) {
  const currentLane = consumer.getCurrentLaneId();
  const isCurrentLane = lane.name === currentLane.name;
  if (!isCurrentLane) {
    throw new Error(
      `updateLanesAfterExport should get called only with current lane, got ${lane.name}, current ${currentLane.name}`
    );
  }
  consumer.setCurrentLane(lane.toLaneId(), true);
  consumer.scope.scopeJson.removeLaneFromNew(lane.name);
  lane.isNew = false;
}

export function isUserTryingToExportLanes(consumer: Consumer) {
  return consumer.isOnLane();
}
