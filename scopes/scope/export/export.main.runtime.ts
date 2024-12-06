import fs from 'fs-extra';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { ScopeAspect, ScopeMain } from '@teambit/scope';
import { BitError } from '@teambit/bit-error';
import { Analytics } from '@teambit/legacy.analytics';
import { ComponentID, ComponentIdList } from '@teambit/component-id';
import { CENTRAL_BIT_HUB_NAME, CENTRAL_BIT_HUB_URL, getCloudDomain } from '@teambit/legacy/dist/constants';
import { Consumer } from '@teambit/legacy/dist/consumer';
import { BitMap } from '@teambit/legacy.bit-map';
import { ComponentsList } from '@teambit/legacy.component-list';
import { RemoveAspect, RemoveMain } from '@teambit/remove';
import { Lane, ModelComponent } from '@teambit/scope.objects';
import { hasWildcard } from '@teambit/legacy.utils';
import { Scope } from '@teambit/legacy/dist/scope';
import { WorkspaceAspect, OutsideWorkspaceError, Workspace } from '@teambit/workspace';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { LaneReadmeComponent } from '@teambit/scope.objects';
import { Http } from '@teambit/scope.network';
import { ObjectItem, ObjectList } from '@teambit/scope.objects';
import { compact } from 'lodash';
import mapSeries from 'p-map-series';
import { LaneId, DEFAULT_LANE } from '@teambit/lane-id';
import { Remotes, Remote, getScopeRemotes } from '@teambit/scope.remotes';
import { EjectAspect, EjectMain, EjectResults } from '@teambit/eject';
import { ExportOrigin } from '@teambit/scope.network';
import { linkToNodeModulesByIds } from '@teambit/workspace.modules.node-modules-linker';
import { DependencyResolverAspect, DependencyResolverMain } from '@teambit/dependency-resolver';
import {
  persistRemotes,
  validateRemotes,
  removePendingDirs,
} from '@teambit/legacy/dist/scope/component-ops/export-scope-components';
import { BitObject, Ref } from '@teambit/scope.objects';
import { PersistFailed } from '@teambit/legacy/dist/scope/exceptions/persist-failed';
import { getAllVersionHashes } from '@teambit/legacy/dist/scope/component-ops/traverse-versions';
import { ExportAspect } from './export.aspect';
import { ExportCmd } from './export-cmd';
import { ResumeExportCmd } from './resume-export-cmd';

export type OnExportIdTransformer = (id: ComponentID) => ComponentID;

const BEFORE_EXPORT = 'exporting component';
const BEFORE_EXPORTS = 'exporting components';
const BEFORE_LOADING_COMPONENTS = 'loading components';

type ModelComponentAndObjects = { component: ModelComponent; objects: BitObject[] };
type ObjectListPerName = { [name: string]: ObjectList };
type ObjectsPerRemote = {
  remote: Remote;
  objectList: ObjectList;
  exportedIds?: string[];
};
type ObjectsPerRemoteExtended = ObjectsPerRemote & {
  objectListPerName: ObjectListPerName;
  idsToChangeLocally: ComponentIdList;
  componentsAndObjects: ModelComponentAndObjects[];
};

type ExportParams = {
  ids?: string[];
  eject?: boolean;
  allVersions?: boolean;
  originDirectly?: boolean;
  includeNonStaged?: boolean;
  resumeExportId?: string | undefined;
  headOnly?: boolean;
  ignoreMissingArtifacts?: boolean;
  forkLaneNewScope?: boolean;
};

export interface ExportResult {
  nonExistOnBitMap: ComponentID[];
  newIdsOnRemote: ComponentID[];
  removedIds: ComponentIdList;
  missingScope: ComponentID[];
  componentsIds: ComponentID[];
  exportedLanes: Lane[];
  rippleJobs: string[];
  rippleJobUrls: string[];
  ejectResults: EjectResults | undefined;
}

export class ExportMain {
  constructor(
    private workspace: Workspace,
    private remove: RemoveMain,
    private depResolver: DependencyResolverMain,
    private logger: Logger,
    private eject: EjectMain
  ) {}

  async export(params: ExportParams = {}): Promise<ExportResult> {
    const { nonExistOnBitMap, newIdsOnRemote, missingScope, exported, removedIds, exportedLanes, rippleJobs } =
      await this.exportComponents(params);
    let ejectResults: EjectResults | undefined;
    await this.workspace.clearCache(); // needed when one process executes multiple commands, such as in "bit test" or "bit cli"
    if (params.eject) ejectResults = await this.ejectExportedComponents(exported);
    const exportResults: ExportResult = {
      componentsIds: exported,
      newIdsOnRemote,
      nonExistOnBitMap,
      removedIds,
      missingScope,
      ejectResults,
      exportedLanes,
      rippleJobs,
      rippleJobUrls: this.getRippleJobUrls(exportedLanes, rippleJobs),
    };
    if (Scope.onPostExport) {
      await Scope.onPostExport(exported, exportedLanes).catch((err) => {
        this.logger.error('fatal: onPostExport encountered an error (this error does not stop the process)', err);
      });
    }

    return exportResults;
  }

  private getRippleJobUrls(exportedLanes: Lane[], rippleJobs: string[]): string[] {
    const lane = exportedLanes.length ? exportedLanes?.[0] : undefined;
    const rippleJobUrls = lane
      ? rippleJobs.map(
          (job) =>
            `https://${getCloudDomain()}/${lane.scope.replace('.', '/')}/~lane/${lane.name}/~ripple-ci/job/${job}`
        )
      : rippleJobs.map((job) => `https://${getCloudDomain()}/ripple-ci/job/${job}`);
    return rippleJobUrls;
  }

  private async exportComponents({
    ids,
    includeNonStaged,
    headOnly,
    originDirectly,
    ...params
  }: ExportParams): Promise<{
    updatedIds: ComponentID[];
    nonExistOnBitMap: ComponentID[];
    removedIds: ComponentIdList;
    missingScope: ComponentID[];
    exported: ComponentID[];
    exportedLanes: Lane[];
    newIdsOnRemote: ComponentID[];
    rippleJobs: string[];
  }> {
    if (!this.workspace) throw new OutsideWorkspaceError();
    const consumer: Consumer = this.workspace.consumer;
    const { idsToExport, missingScope, laneObject } = await this.getComponentsToExport(
      ids,
      includeNonStaged || headOnly
    );

    if (!idsToExport.length && !laneObject) {
      return {
        updatedIds: [],
        nonExistOnBitMap: [],
        removedIds: new ComponentIdList(),
        missingScope,
        exported: [],
        newIdsOnRemote: [],
        exportedLanes: [],
        rippleJobs: [],
      };
    }
    if (!idsToExport.length && laneObject && params.forkLaneNewScope) {
      throw new BitError(`the forked lane "${laneObject.name}" has no changes, to export all its components, please use "--all" flag
if the export fails with missing objects/versions/components, run "bit fetch --lanes <lane-name> --all-history", to make sure you have the full history locally`);
    }

    // validate lane readme component and ensure it has been snapped
    if (laneObject?.readmeComponent) {
      _throwForUnsnappedLaneReadme(laneObject);
    }

    if (
      !params.forkLaneNewScope &&
      laneObject?.forkedFrom &&
      laneObject.isNew &&
      laneObject.forkedFrom.scope !== laneObject.scope
    ) {
      throw new BitError(`error: the current lane ${laneObject
        .id()
        .toString()} was forked from ${laneObject.forkedFrom.toString()}
and is about to export to a different scope (${laneObject.scope}) than the original lane (${
        laneObject.forkedFrom.scope
      }).
on large lanes with long history graph, it results in exporting lots of objects to the new scope, some of them might be missing locally.
if you can use the same scope as the original name, change it now by running "bit lane change-scope ${
        laneObject.name
      } ${laneObject.forkedFrom.scope}".
otherwise, re-run the export with "--fork-lane-new-scope" flag.
if the export fails with missing objects/versions/components, run "bit fetch --lanes <lane-name> --all-history", to make sure you have the full history locally`);
    }
    const isOnMain = consumer.isOnMain();
    const { exported, updatedLocally, newIdsOnRemote, rippleJobs } = await this.exportMany({
      ...params,
      exportHeadsOnly: headOnly,
      scope: consumer.scope,
      ids: idsToExport,
      laneObject,
      originDirectly,
      isOnMain,
      filterOutExistingVersions: Boolean(!params.allVersions && laneObject),
    });
    if (laneObject) await updateLanesAfterExport(consumer, laneObject);
    const removedIds = await this.getRemovedStagedBitIds();
    const workspaceIds = this.workspace.listIds();
    const nonExistOnBitMap = exported.filter(
      (id) => !workspaceIds.hasWithoutVersion(id) && !removedIds.hasWithoutVersion(id)
    );
    // @ts-ignore todo: remove after deleting teambit.legacy
    const updatedIds = _updateIdsOnBitMap(consumer.bitMap, updatedLocally);
    // re-generate the package.json, this way, it has the correct data in the componentId prop.
    await linkToNodeModulesByIds(this.workspace, updatedIds, true);
    await this.removeFromStagedConfig(exported);
    // ideally we should delete the staged-snaps only for the exported snaps. however, it's not easy, and it's ok to
    // delete them all because this file is mainly an optimization for the import process.
    await this.workspace.scope.legacyScope.stagedSnaps.deleteFile();
    await fs.remove(this.workspace.scope.getLastMergedPath());
    Analytics.setExtraData('num_components', exported.length);
    // it is important to have consumer.onDestroy() before running the eject operation, we want the
    // export and eject operations to function independently. we don't want to lose the changes to
    // .bitmap file done by the export action in case the eject action has failed.
    await consumer.onDestroy('export');
    return {
      updatedIds,
      nonExistOnBitMap,
      removedIds,
      missingScope,
      exported,
      newIdsOnRemote,
      exportedLanes: laneObject ? [laneObject] : [],
      rippleJobs,
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
    resumeExportId,
    throwForMissingArtifacts,
    isOnMain = true,
    exportHeadsOnly, // relevant when exporting from bare-scope, especially when re-exporting existing versions, the normal calculation based on getDivergeData won't work
    includeParents, // relevant when exportHeadsOnly is used. sometimes the parents head are needed as well
    filterOutExistingVersions, // go to the remote and check whether the version exists there. if so, don't export it
    exportOrigin = 'export',
  }: {
    scope: Scope;
    ids: ComponentIdList;
    laneObject?: Lane;
    allVersions?: boolean;
    originDirectly?: boolean;
    resumeExportId?: string | undefined;
    throwForMissingArtifacts?: boolean;
    isOnMain?: boolean;
    exportHeadsOnly?: boolean;
    includeParents?: boolean;
    filterOutExistingVersions?: boolean;
    exportOrigin?: ExportOrigin;
  }): Promise<{
    exported: ComponentIdList;
    updatedLocally: ComponentIdList;
    newIdsOnRemote: ComponentID[];
    rippleJobs: string[];
  }> {
    this.logger.debug(`scope.exportMany, ids: ${ids.toString()}`);
    const scopeRemotes: Remotes = await getScopeRemotes(scope);

    const groupByScopeName = (idList: ComponentIdList): { [scopeName: string]: ComponentIdList } => {
      return idList.reduce((acc, current) => {
        const scopeName = current.scope;
        if (!scopeName) {
          throw new Error(`toGroupByScopeName() expect ids to have a scope name, got ${current.toString()}`);
        }
        if (acc[scopeName]) acc[scopeName].push(current);
        else acc[scopeName] = new ComponentIdList(current);
        return acc;
      }, {});
    };

    const idsGroupedByScope = groupByScopeName(ids);

    /**
     * when a component is exported for the first time, and the lane-scope is not the same as the component-scope, it's
     * important to validate that there is no such component in the original scope. otherwise, later, it'll be impossible
     * to merge the lane because these two components don't have any snap in common.
     */
    const validateTargetScopeForLanes = async () => {
      if (!laneObject) {
        return;
      }
      const newIds = ComponentIdList.fromArray(ids.filter((id) => !scope.isExported(id)));
      const newIdsGrouped = groupByScopeName(newIds);
      await mapSeries(Object.keys(newIdsGrouped), async (scopeName) => {
        if (scopeName === laneObject.scope) {
          // this validation is redundant if the lane-component is in the same scope as the lane-object
          return;
        }
        // by getting the remote we also validate that this scope actually exists.
        const remote = await scopeRemotes.resolve(scopeName, scope);
        const list = await remote.list();
        const listIds = ComponentIdList.fromArray(list.map((listItem) => listItem.id));
        newIdsGrouped[scopeName].forEach((id) => {
          if (listIds.hasWithoutVersion(id)) {
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

    const getVersionsToExport = async (modelComponent: ModelComponent): Promise<Ref[]> => {
      if (exportHeadsOnly) {
        const head =
          laneObject?.getCompHeadIncludeUpdateDependents(modelComponent.toComponentId()) || modelComponent.head;
        if (!head) {
          throw new Error(
            `getVersionsToExport should export the head only, but the head of ${modelComponent.id()} is missing`
          );
        }
        if (includeParents) {
          const headVersion = await modelComponent.loadVersion(head.toString(), scope.objects);
          return [head, ...headVersion.parents];
        }
        return [head];
      }
      const localTagsOrHashes = await modelComponent.getLocalHashes(scope.objects);
      if (!allVersions) {
        return localTagsOrHashes;
      }

      const allHashes = await getAllVersionHashes({ modelComponent, repo: scope.objects });
      await addMainHeadIfPossible(allHashes, modelComponent);
      return allHashes;
    };

    await validateTargetScopeForLanes();
    const groupedByScopeString = Object.keys(idsGroupedByScope)
      .map((scopeName) => `scope "${scopeName}": ${idsGroupedByScope[scopeName].toString()}`)
      .join(', ');
    this.logger.debug(`export-scope-components, export to the following scopes ${groupedByScopeString}`);

    const getUpdatedObjectsToExport = async (
      remoteNameStr: string,
      bitIds: ComponentIdList,
      lane?: Lane
    ): Promise<ObjectsPerRemoteExtended> => {
      bitIds.throwForDuplicationIgnoreVersion();
      const remote: Remote = await scopeRemotes.resolve(remoteNameStr, scope);
      const idsToChangeLocally = ComponentIdList.fromArray(bitIds.filter((id) => !scope.isExported(id)));
      const componentsAndObjects: ModelComponentAndObjects[] = [];
      const objectList = new ObjectList();
      const objectListPerName: ObjectListPerName = {};

      const modelComponents = await mapSeries(bitIds, (id) => scope.getModelComponent(id));
      // super important! otherwise, the processModelComponent() changes objects in memory, while the key remains the same
      scope.objects.clearObjectsFromCache();

      const refsToPotentialExportPerComponent = await mapSeries(modelComponents, async (modelComponent) => {
        const refs = await getVersionsToExport(modelComponent);
        return { modelComponent, refs };
      });

      const getRefsToExportPerComp = async () => {
        if (!filterOutExistingVersions) {
          return refsToPotentialExportPerComponent;
        }
        const allHashesAsStr = refsToPotentialExportPerComponent
          .map((r) => r.refs)
          .flat()
          .map((ref) => ref.toString());
        const existingOnRemote = await scope.scopeImporter.checkWhatHashesExistOnRemote(remoteNameStr, allHashesAsStr);
        // for lanes, some snaps might be already on the remote, and the reason they're staged is due to a previous merge.
        const refsToExportPerComponent = refsToPotentialExportPerComponent.map(({ modelComponent, refs }) => {
          const filteredOutRefs: string[] = [];
          const refsToExport = refs.filter((ref) => {
            const existing = existingOnRemote.includes(ref.toString());
            if (existing) filteredOutRefs.push(ref.toString());
            return !existing;
          });
          if (filteredOutRefs.length)
            this.logger.debug(
              `export-scope-components, the following refs were filtered out from ${modelComponent
                .id()
                .toString()} because they already exist on the remote:\n${filteredOutRefs.join('\n')}`
            );

          return refsToExport.length ? { modelComponent, refs: refsToExport } : null;
        });

        return compact(refsToExportPerComponent);
      };

      const bitObjectToObjectItem = async (obj: BitObject): Promise<ObjectItem> => {
        return {
          ref: obj.hash(),
          buffer: await obj.compress(),
          type: obj.getType(),
        };
      };

      const processModelComponent = async ({
        modelComponent,
        refs,
      }: {
        modelComponent: ModelComponent;
        refs: Ref[];
      }) => {
        modelComponent.clearStateData();
        const objectItems = await modelComponent.collectVersionsObjects(
          scope.objects,
          refs.map((ref) => ref.toString()),
          throwForMissingArtifacts
        );
        const objectsList = await new ObjectList(objectItems).toBitObjects();
        const componentAndObject = { component: modelComponent, objects: objectsList.getAll() };
        await this.convertToCorrectScope(scope, componentAndObject, remoteNameStr, bitIds, ids);
        const remoteObj = { url: remote.host, name: remote.name, date: Date.now().toString() };
        modelComponent.addScopeListItem(remoteObj);
        componentsAndObjects.push(componentAndObject);
        const componentBuffer = await modelComponent.compress();
        const componentData = { ref: modelComponent.hash(), buffer: componentBuffer, type: modelComponent.getType() };
        const objectsBuffer = await Promise.all(
          componentAndObject.objects.map(async (obj) => bitObjectToObjectItem(obj))
        );
        const allObjectsData = [componentData, ...objectsBuffer];
        objectListPerName[modelComponent.name] = new ObjectList(allObjectsData);
        objectList.addIfNotExist(allObjectsData);
      };

      const refsToExportPerComponent = await getRefsToExportPerComp();
      // don't use Promise.all, otherwise, it'll throw "JavaScript heap out of memory" on a large set of data
      await mapSeries(refsToExportPerComponent, processModelComponent);
      if (lane) {
        const laneHistory = await scope.lanes.getOrCreateLaneHistory(lane);
        const laneHistoryData = await bitObjectToObjectItem(laneHistory);
        objectList.addIfNotExist([laneHistoryData]);
        const laneData = await bitObjectToObjectItem(lane);
        objectList.addIfNotExist([laneData]);
      }

      return { remote, objectList, objectListPerName, idsToChangeLocally, componentsAndObjects };
    };

    const manyObjectsPerRemote = laneObject
      ? [await getUpdatedObjectsToExport(laneObject.scope, ids, laneObject)]
      : await mapSeries(Object.keys(idsGroupedByScope), (scopeName) =>
          getUpdatedObjectsToExport(scopeName, idsGroupedByScope[scopeName], laneObject)
        );

    const pushAllToCentralHub = async () => {
      const objectList = this.transformToOneObjectListWithScopeData(manyObjectsPerRemote);
      const http = await Http.connect(CENTRAL_BIT_HUB_URL, CENTRAL_BIT_HUB_NAME);
      const pushResults = await http.pushToCentralHub(objectList, { origin: exportOrigin });
      const { failedScopes, successIds, errors, metadata } = pushResults;
      if (failedScopes.length) {
        throw new PersistFailed(failedScopes, errors);
      }
      const exportedBitIds = successIds.map((id) => ComponentID.fromString(id));
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
      return { rippleJobs: metadata?.jobs };
    };

    const updateLocalObjects = async (
      lane?: Lane
    ): Promise<
      Array<{ exported: ComponentIdList; updatedLocally: ComponentIdList; newIdsOnRemote: ComponentID[] }>
    > => {
      return mapSeries(manyObjectsPerRemote, async (objectsPerRemote: ObjectsPerRemoteExtended) => {
        const { remote, idsToChangeLocally, componentsAndObjects, exportedIds } = objectsPerRemote;
        const remoteNameStr = remote.name;

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
              await scope.objects.remoteLanes.addEntry(remoteLaneId, component.toComponentId(), component.getHead());
            })
          );
        }

        await scope.objects.persist();
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const newIdsOnRemote = exportedIds!.map((id) => ComponentID.fromString(id));
        // remove version. exported component might have multiple versions exported
        const idsWithRemoteScope: ComponentID[] = newIdsOnRemote.map((id) => id.changeVersion(undefined));
        const idsWithRemoteScopeUniq = ComponentIdList.uniqFromArray(idsWithRemoteScope).sort();
        return {
          newIdsOnRemote,
          exported: idsWithRemoteScopeUniq,
          updatedLocally: ComponentIdList.fromArray(
            idsWithRemoteScopeUniq.filter((id) => idsToChangeLocally.hasWithoutScopeAndVersion(id))
          ),
        };
      });
    };

    const warnCancelExport = () => {
      this.logger.consoleWarning(
        `unable to cancel the export process at this point because the communication with the remote already started`
      );
    };
    process.on('SIGINT', warnCancelExport);
    let centralHubResults;
    if (resumeExportId) {
      const remotes = manyObjectsPerRemote.map((o) => o.remote);
      await validateRemotes(remotes, resumeExportId);
      await persistRemotes(manyObjectsPerRemote, resumeExportId);
    } else if (this.shouldPushToCentralHub(manyObjectsPerRemote, scopeRemotes, originDirectly)) {
      centralHubResults = await pushAllToCentralHub();
    } else {
      // await pushToRemotes();
      await this.pushToRemotesCarefully(manyObjectsPerRemote, resumeExportId);
    }

    this.logger.setStatusLine('updating data locally...');
    const results = await updateLocalObjects(laneObject);
    process.removeListener('SIGINT', warnCancelExport);
    return {
      newIdsOnRemote: results.map((r) => r.newIdsOnRemote).flat(),
      exported: ComponentIdList.uniqFromArray(results.map((r) => r.exported).flat()),
      updatedLocally: ComponentIdList.uniqFromArray(results.map((r) => r.updatedLocally).flat()),
      rippleJobs: centralHubResults?.rippleJobs || [],
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

  private async ejectExportedComponents(componentsIds: ComponentID[]): Promise<EjectResults> {
    const consumer: Consumer = this.workspace.consumer;
    let ejectResults: EjectResults;
    try {
      ejectResults = await this.eject.eject(componentsIds, { force: true });
    } catch (err: any) {
      const ejectErr = `The components ${componentsIds.map((c) => c.toString()).join(', ')} were exported successfully.
      However, the eject operation has failed due to an error: ${err.msg || err}`;
      this.logger.error(ejectErr, err);
      throw new Error(ejectErr);
    }
    // run the consumer.onDestroy() again, to write the changes done by the eject action to .bitmap
    await consumer.onDestroy('export (eject)');
    return ejectResults;
  }

  async pushToRemotesCarefully(manyObjectsPerRemote: ObjectsPerRemote[], resumeExportId?: string) {
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
      this.logger.debug('pushRemotesPendingDir - skip as the resumeExportId was passed');
      // no need to transfer the objects, they're already on the server. also, since this clientId
      // exists already on the remote pending-dir, it'll cause a collision.
      return;
    }
    const pushOptions = { clientId };
    const pushedRemotes: Remote[] = [];
    await mapSeries(manyObjectsPerRemote, async (objectsPerRemote: ObjectsPerRemote) => {
      const { remote, objectList } = objectsPerRemote;
      this.logger.setStatusLine(`transferring ${objectList.count()} objects to the remote "${remote.name}"...`);
      try {
        await remote.pushMany(objectList, pushOptions, {});
        this.logger.debug(
          'pushRemotesPendingDir, successfully pushed all objects to the pending-dir directory on the remote'
        );
        pushedRemotes.push(remote);
      } catch (err: any) {
        this.logger.warn('exportMany, failed pushing objects to the remote');
        await removePendingDirs(pushedRemotes, clientId);
        throw err;
      }
    });
  }

  shouldPushToCentralHub(
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
  private async convertToCorrectScope(
    scope: Scope,
    componentsObjects: ModelComponentAndObjects,
    remoteScope: string,
    exportingIds: ComponentIdList,
    ids: ComponentIdList,
    shouldFork = false // not in used currently, but might be needed soon
  ): Promise<boolean> {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const shouldChangeScope = shouldFork
      ? remoteScope !== componentsObjects.component.scope
      : !componentsObjects.component.scope;
    const hasComponentChanged = shouldChangeScope;
    if (shouldChangeScope) {
      const idWithFutureScope = ids.searchWithoutScopeAndVersion(componentsObjects.component.toComponentId());
      componentsObjects.component.scope = idWithFutureScope?.scope || remoteScope;
    }

    // return true if one of the versions has changed or the component itself
    return hasComponentChanged;
  }

  private async removeFromStagedConfig(ids: ComponentID[]) {
    this.logger.debug(`removeFromStagedConfig, ${ids.length} ids`);
    const stagedConfig = await this.workspace.scope.getStagedConfig();
    ids.map((compId) => stagedConfig.removeComponentConfig(compId));
    await stagedConfig.write();
  }

  private async getComponentsToExport(
    ids: string[] = [],
    includeNonStaged?: boolean
  ): Promise<{
    idsToExport: ComponentIdList;
    missingScope: ComponentID[];
    laneObject?: Lane;
  }> {
    const consumer = this.workspace.consumer;
    const componentsList = new ComponentsList(consumer);
    const idsHaveWildcard = hasWildcard(ids);
    const throwForLocalOnlyIfNeeded = async (
      bitIds: ComponentIdList
    ): Promise<{ idsToExport: ComponentIdList; missingScope: ComponentID[] }> => {
      const localOnlyComponents = this.workspace.listLocalOnly();
      const localOnlyExportPending = bitIds.filter((id) => localOnlyComponents.hasWithoutScopeAndVersion(id));
      if (localOnlyExportPending.length) {
        throw new BitError(`unable to export the following components as they are local only:
(either bit-reset them or run "bit local-only unset" to make them non local only)
${localOnlyExportPending.map((c) => c.toString()).join('\n')}`);
      }
      return { idsToExport: ComponentIdList.fromArray(bitIds), missingScope: [] };
    };
    if (isUserTryingToExportLanes(consumer)) {
      if (ids.length) {
        throw new BitError(`when checked out to a lane, all its components are exported. please omit the ids`);
      }
      const { componentsToExport, laneObject } = await this.getLaneCompIdsToExport(consumer, includeNonStaged);
      const loaderMsg = componentsToExport.length > 1 ? BEFORE_EXPORTS : BEFORE_EXPORT;
      this.logger.setStatusLine(loaderMsg);
      const filtered = await throwForLocalOnlyIfNeeded(componentsToExport);
      return { ...filtered, laneObject };
    }
    if (!ids.length || idsHaveWildcard) {
      this.logger.setStatusLine(BEFORE_LOADING_COMPONENTS);
      const exportPendingComponents: ComponentIdList = includeNonStaged
        ? await componentsList.listNonNewComponentsIds()
        : await componentsList.listExportPendingComponentsIds();
      const componentsToExport = idsHaveWildcard
        ? ComponentsList.filterComponentsByWildcard(exportPendingComponents, ids)
        : exportPendingComponents;
      const loaderMsg = componentsToExport.length > 1 ? BEFORE_EXPORTS : BEFORE_EXPORT;
      this.logger.setStatusLine(loaderMsg);
      return throwForLocalOnlyIfNeeded(componentsToExport);
    }
    this.logger.setStatusLine(BEFORE_EXPORT); // show single export
    const parsedIds = await Promise.all(ids.map((id) => getParsedId(consumer, id)));
    // load the components for fixing any out-of-sync issues.
    await consumer.loadComponents(ComponentIdList.fromArray(parsedIds));

    return throwForLocalOnlyIfNeeded(ComponentIdList.fromArray(parsedIds));
  }

  private async getLaneCompIdsToExport(
    consumer: Consumer,
    includeNonStaged?: boolean
  ): Promise<{ componentsToExport: ComponentIdList; laneObject: Lane }> {
    const currentLaneId = consumer.getCurrentLaneId();
    const laneObject = await consumer.scope.loadLane(currentLaneId);
    if (!laneObject) {
      throw new Error(`fatal: unable to load the current lane object (${currentLaneId.toString()})`);
    }
    this.logger.setStatusLine(BEFORE_LOADING_COMPONENTS);
    const componentsList = new ComponentsList(consumer);
    const componentsToExportWithoutRemoved = includeNonStaged
      ? await componentsList.listNonNewComponentsIds()
      : await componentsList.listExportPendingComponentsIds(laneObject);
    const removedStagedBitIds = await this.getRemovedStagedBitIds();
    const componentsToExport = ComponentIdList.uniqFromArray([
      ...componentsToExportWithoutRemoved,
      ...removedStagedBitIds,
    ]);
    return { componentsToExport, laneObject };
  }

  private async getRemovedStagedBitIds(): Promise<ComponentIdList> {
    const removedStaged = await this.remove.getRemovedStaged();
    return ComponentIdList.fromArray(removedStaged.map((id) => id.changeVersion(undefined)));
  }

  static runtime = MainRuntime;
  static dependencies = [
    CLIAspect,
    ScopeAspect,
    WorkspaceAspect,
    RemoveAspect,
    DependencyResolverAspect,
    LoggerAspect,
    EjectAspect,
  ];
  static async provider([cli, scope, workspace, remove, depResolver, loggerMain, eject]: [
    CLIMain,
    ScopeMain,
    Workspace,
    RemoveMain,
    DependencyResolverMain,
    LoggerMain,
    EjectMain,
  ]) {
    const logger = loggerMain.createLogger(ExportAspect.id);
    const exportMain = new ExportMain(workspace, remove, depResolver, logger, eject);
    cli.register(new ResumeExportCmd(scope), new ExportCmd(exportMain));
    return exportMain;
  }
}

ExportAspect.addRuntime(ExportMain);

/**
 * the componentsIds passed here are the ones that didn't have scope-name before, and now they have.
 * so if the bitMap.updateComponentId returns bitId without scope-name is because it couldn't find it there
 */
function _updateIdsOnBitMap(bitMap: BitMap, componentsIds: ComponentIdList): ComponentID[] {
  const updatedIds: ComponentID[] = [];
  componentsIds.forEach((componentsId) => {
    const resultId = bitMap.updateComponentId(componentsId, true);
    if (resultId.hasVersion()) updatedIds.push(resultId);
  });
  return updatedIds;
}

async function getParsedId(consumer: Consumer, id: string): Promise<ComponentID> {
  // reason why not calling `consumer.getParsedId()` only is because a component might not be on
  // .bitmap and only in the scope. we support this case and enable to export
  try {
    return consumer.getParsedId(id);
  } catch (err: any) {
    return consumer.scope.getParsedId(id);
  }
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

export default ExportMain;
