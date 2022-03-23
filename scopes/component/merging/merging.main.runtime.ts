import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import R from 'ramda';
import { Consumer } from '@teambit/legacy/dist/consumer';
import ComponentsList from '@teambit/legacy/dist/consumer/component/components-list';
import { LanesIsDisabled } from '@teambit/legacy/dist/consumer/lanes/exceptions/lanes-is-disabled';
import {
  ApplyVersionResults,
  MergeStrategy,
  mergeVersion,
  ApplyVersionResult,
  FailedComponents,
  FileStatus,
  getMergeStrategyInteractive,
  MergeOptions,
} from '@teambit/legacy/dist/consumer/versions-ops/merge-version';
import { ConsumerNotFound } from '@teambit/legacy/dist/consumer/exceptions';
import SnappingAspect, { SnappingMain } from '@teambit/snapping';
import hasWildcard from '@teambit/legacy/dist/utils/string/has-wildcard';
import fs from 'fs-extra';
import mapSeries from 'p-map-series';
import path from 'path';
import { BitId, BitIds } from '@teambit/legacy/dist/bit-id';
import { COMPONENT_ORIGINS } from '@teambit/legacy/dist/constants';
import GeneralError from '@teambit/legacy/dist/error/general-error';
import LaneId, { LocalLaneId, RemoteLaneId } from '@teambit/legacy/dist/lane-id/lane-id';
import logger from '@teambit/legacy/dist/logger/logger';
import { AutoTagResult } from '@teambit/legacy/dist/scope/component-ops/auto-tag';
import { getDivergeData } from '@teambit/legacy/dist/scope/component-ops/get-diverge-data';
import { UnmergedComponent } from '@teambit/legacy/dist/scope/lanes/unmerged-components';
import { Lane, Version } from '@teambit/legacy/dist/scope/models';
import { Ref } from '@teambit/legacy/dist/scope/objects';
import { Tmp } from '@teambit/legacy/dist/scope/repositories';
import { pathNormalizeToLinux } from '@teambit/legacy/dist/utils';
import ManyComponentsWriter from '@teambit/legacy/dist/consumer/component-ops/many-components-writer';
import Component from '@teambit/legacy/dist/consumer/component/consumer-component';
import checkoutVersion, { applyModifiedVersion } from '@teambit/legacy/dist/consumer/versions-ops/checkout-version';
import threeWayMerge, {
  MergeResultsThreeWay,
} from '@teambit/legacy/dist/consumer/versions-ops/merge-version/three-way-merge';
import { TrackLane } from '@teambit/legacy/dist/scope/scope-json';
import { MergeCmd } from './merge-cmd';
import { MergingAspect } from './merging.aspect';

export type ComponentStatus = {
  componentFromFS?: Component | null;
  componentFromModel?: Version;
  id: BitId;
  failureMessage?: string;
  mergeResults?: MergeResultsThreeWay | null;
};

export class MergingMain {
  private consumer: Consumer;
  constructor(private workspace: Workspace, private snapping: SnappingMain) {
    this.consumer = this.workspace?.consumer;
  }

  /**
   * merge components according to the "values" param.
   * if the first param is a version, then merge the component ids to that version.
   * otherwise, merge from the remote head to the local.
   */
  async merge(
    values: string[],
    mergeStrategy: MergeStrategy,
    abort: boolean,
    resolve: boolean,
    noSnap: boolean,
    message: string,
    build: boolean
  ): Promise<ApplyVersionResults> {
    if (!this.workspace) throw new ConsumerNotFound();
    const consumer: Consumer = this.workspace.consumer;
    if (consumer.isLegacy && (noSnap || message || abort || resolve)) {
      throw new LanesIsDisabled();
    }
    let mergeResults;
    const firstValue = R.head(values);
    if (resolve) {
      mergeResults = await this.resolveMerge(consumer, values, message, build);
    } else if (abort) {
      mergeResults = await this.abortMerge(consumer, values);
    } else if (!BitId.isValidVersion(firstValue)) {
      const bitIds = this.getComponentsToMerge(consumer, values);
      // @todo: version could be the lane only or remote/lane
      mergeResults = await this.mergeComponentsFromRemote(consumer, bitIds, mergeStrategy, noSnap, message, build);
    } else {
      const version = firstValue;
      const ids = R.tail(values);
      const bitIds = this.getComponentsToMerge(consumer, ids);
      mergeResults = await mergeVersion(consumer, version, bitIds, mergeStrategy);
    }
    await consumer.onDestroy();
    return mergeResults;
  }

  /**
   * when user is on main, it merges the remote main components into local.
   * when user is on a lane, it merges the remote lane components into the local lane.
   */
  async mergeComponentsFromRemote(
    consumer: Consumer,
    bitIds: BitId[],
    mergeStrategy: MergeStrategy,
    noSnap: boolean,
    snapMessage: string,
    build: boolean
  ): Promise<ApplyVersionResults> {
    const localLaneId = consumer.getCurrentLaneId();
    const localLaneObject = await consumer.getCurrentLaneObject();
    const remoteTrackedLane = consumer.scope.lanes.getRemoteTrackedDataByLocalLane(localLaneId.name);
    if (!localLaneId.isDefault() && !remoteTrackedLane) {
      throw new Error(`unable to find a remote tracked to the local lane "${localLaneId.name}"`);
    }
    const allComponentsStatus = await this.getAllComponentsStatus(
      bitIds,
      localLaneId,
      localLaneObject,
      remoteTrackedLane
    );

    return this.mergeSnaps({
      mergeStrategy,
      allComponentsStatus,
      remoteName: remoteTrackedLane ? remoteTrackedLane.remoteScope : null,
      laneId: localLaneId,
      localLane: localLaneObject,
      noSnap,
      snapMessage,
      build,
    });
  }

  /**
   * merge multiple components according to the "allComponentsStatus".
   */
  async mergeSnaps({
    mergeStrategy,
    allComponentsStatus,
    remoteName,
    laneId,
    localLane,
    noSnap,
    snapMessage,
    build,
  }: {
    mergeStrategy: MergeStrategy;
    allComponentsStatus: ComponentStatus[];
    remoteName: string | null;
    laneId: LaneId;
    localLane: Lane | null;
    noSnap: boolean;
    snapMessage: string;
    build: boolean;
  }) {
    const consumer = this.workspace.consumer;
    const componentWithConflict = allComponentsStatus.find(
      (component) => component.mergeResults && component.mergeResults.hasConflicts
    );
    if (componentWithConflict && !mergeStrategy) {
      mergeStrategy = await getMergeStrategyInteractive();
    }
    const failedComponents: FailedComponents[] = allComponentsStatus
      .filter((componentStatus) => componentStatus.failureMessage)
      .map((componentStatus) => ({ id: componentStatus.id, failureMessage: componentStatus.failureMessage as string }));
    const succeededComponents = allComponentsStatus.filter((componentStatus) => !componentStatus.failureMessage);
    // do not use Promise.all for applyVersion. otherwise, it'll write all components in parallel,
    // which can be an issue when some components are also dependencies of others
    const componentsResults = await mapSeries(succeededComponents, ({ componentFromFS, id, mergeResults }) => {
      return this.applyVersion({
        consumer,
        componentFromFS,
        id,
        mergeResults,
        mergeStrategy,
        remoteHead: new Ref(id.version as string),
        // @ts-ignore
        remoteName: remoteName || componentFromFS.scope,
        laneId,
        localLane,
      });
    });

    if (localLane) consumer.scope.objects.add(localLane);

    await consumer.scope.objects.persist(); // persist anyway, it localLane is null it should save all main heads

    await consumer.scope.objects.unmergedComponents.write();

    const mergeSnapResults = noSnap ? null : await this.snapResolvedComponents(consumer, snapMessage, build);

    return { components: componentsResults, failedComponents, mergeSnapResults };
  }

  async getComponentMergeStatus(
    id: BitId,
    localLane: Lane | null,
    otherLaneName: string,
    existingOnWorkspaceOnly = false
  ): Promise<ComponentStatus> {
    const consumer = this.workspace.consumer;
    const componentStatus: ComponentStatus = { id };
    const returnFailure = (msg: string) => {
      componentStatus.failureMessage = msg;
      return componentStatus;
    };
    const modelComponent = await consumer.scope.getModelComponentIfExist(id);
    if (!modelComponent) {
      throw new GeneralError(
        `component ${id.toString()} is on the lane but its objects were not found, please re-import the lane`
      );
    }
    const unmerged = consumer.scope.objects.unmergedComponents.getEntry(id.name);
    if (unmerged && unmerged.resolved === false) {
      return returnFailure(
        `component ${id.toStringWithoutVersion()} has conflicts that need to be resolved first, please use bit merge --resolve/--abort`
      );
    }
    const version = id.version as string;
    const existingBitMapId = consumer.bitMap.getBitIdIfExist(id, { ignoreVersion: true });
    const componentOnLane: Version = await modelComponent.loadVersion(version, consumer.scope.objects);
    if (!existingBitMapId) {
      if (existingOnWorkspaceOnly) {
        return returnFailure(`component ${id.toStringWithoutVersion()} is not in the workspace`);
      }
      // @ts-ignore
      return { componentFromFS: null, componentFromModel: componentOnLane, id, mergeResults: null };
    }
    const currentlyUsedVersion = existingBitMapId.version;
    if (currentlyUsedVersion === version) {
      // @todo: maybe this check is not needed as we check for diverge later on
      if (localLane || modelComponent.hasHead()) {
        return returnFailure(`component ${id.toStringWithoutVersion()} is already merged`);
      }
    }
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const component = await consumer.loadComponent(existingBitMapId);
    const componentModificationStatus = await consumer.getComponentStatusById(component.id);
    if (componentModificationStatus.modified) {
      throw new GeneralError(
        `unable to merge ${id.toStringWithoutVersion()}, the component is modified, please snap/tag it first`
      );
    }
    const repo = consumer.scope.objects;
    const laneHeadIsDifferentThanCheckedOut =
      localLane && currentlyUsedVersion && modelComponent.laneHeadLocal?.toString() !== currentlyUsedVersion;
    const localHead = laneHeadIsDifferentThanCheckedOut ? Ref.from(currentlyUsedVersion) : null;

    const otherLaneHead = new Ref(version);
    const divergeData = await getDivergeData(repo, modelComponent, otherLaneHead, localHead);
    if (!divergeData.isDiverged()) {
      if (divergeData.isLocalAhead()) {
        // do nothing!
        return returnFailure(`component ${component.id.toString()} is ahead, nothing to merge`);
      }
      if (divergeData.isRemoteAhead()) {
        // just override with the model data
        return {
          componentFromFS: component,
          componentFromModel: componentOnLane,
          id,
          mergeResults: null,
        };
      }
      // we know that localHead and remoteHead are set, so if none of them is ahead they must be equal
      return returnFailure(`component ${component.id.toString()} is already merged`);
    }
    const baseSnap = divergeData.commonSnapBeforeDiverge as Ref; // must be set when isTrueMerge
    const baseComponent: Version = await modelComponent.loadVersion(baseSnap.toString(), repo);
    const otherComponent: Version = await modelComponent.loadVersion(otherLaneHead.toString(), repo);
    const mergeResults = await threeWayMerge({
      consumer,
      otherComponent,
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      otherLabel: `${otherLaneHead.toString()} (${otherLaneName})`,
      currentComponent: component,
      currentLabel: `${currentlyUsedVersion} (local)`,
      baseComponent,
    });
    return { componentFromFS: component, id, mergeResults };
  }

  private async applyVersion({
    consumer,
    componentFromFS,
    id,
    mergeResults,
    mergeStrategy,
    remoteHead,
    remoteName,
    laneId,
    localLane,
  }: {
    consumer: Consumer;
    componentFromFS: Component | null | undefined;
    id: BitId;
    mergeResults: MergeResultsThreeWay | null | undefined;
    mergeStrategy: MergeStrategy;
    remoteHead: Ref;
    remoteName: string | null;
    laneId: LaneId;
    localLane: Lane | null;
  }): Promise<ApplyVersionResult> {
    let filesStatus = {};
    const unmergedComponent: UnmergedComponent = {
      // @ts-ignore
      id: { name: id.name, scope: id.scope },
      // @ts-ignore
      head: remoteHead,
      // @ts-ignore
      remote: remoteName,
      lane: laneId.name,
      resolved: false, // could be changed later
    };
    id = componentFromFS ? componentFromFS.id : id;
    if (mergeResults && mergeResults.hasConflicts && mergeStrategy === MergeOptions.ours) {
      if (!componentFromFS) throw new Error(`applyVersion expect to get componentFromFS for ${id.toString()}`);
      componentFromFS.files.forEach((file) => {
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        filesStatus[pathNormalizeToLinux(file.relative)] = FileStatus.unchanged;
      });
      unmergedComponent.resolved = true;
      consumer.scope.objects.unmergedComponents.addEntry(unmergedComponent);

      return { id, filesStatus };
    }
    const remoteId = id.changeVersion(remoteHead.toString());
    const idToLoad = !mergeResults || mergeStrategy === MergeOptions.theirs ? remoteId : id;
    const componentWithDependencies = await consumer.loadComponentWithDependenciesFromModel(idToLoad);
    const componentMap = componentFromFS && componentFromFS.componentMap;
    if (componentFromFS && !componentMap) throw new GeneralError('applyVersion: componentMap was not found');
    if (componentMap && componentMap.origin === COMPONENT_ORIGINS.AUTHORED && !id.scope) {
      componentWithDependencies.dependencies = [];
      componentWithDependencies.devDependencies = [];
    }
    const shouldWritePackageJson = async (): Promise<boolean> => {
      if (!componentMap) return true;
      const rootDir = componentMap && componentMap.rootDir;
      if (!rootDir) return false;
      const packageJsonPath = path.join(consumer.getPath(), rootDir, 'package.json');
      return fs.pathExists(packageJsonPath);
    };
    const shouldInstallNpmPackages = (): boolean => {
      if (componentMap && componentMap.origin === COMPONENT_ORIGINS.AUTHORED) return false;
      return true;
    };
    const writePackageJson = await shouldWritePackageJson();

    const files = componentWithDependencies.component.files;
    files.forEach((file) => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      filesStatus[pathNormalizeToLinux(file.relative)] = FileStatus.updated;
    });

    if (mergeResults) {
      // update files according to the merge results
      const { filesStatus: modifiedStatus, modifiedFiles } = applyModifiedVersion(
        files,
        mergeResults,
        mergeStrategy,
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        componentWithDependencies.component.originallySharedDir
      );
      componentWithDependencies.component.files = modifiedFiles;
      filesStatus = { ...filesStatus, ...modifiedStatus };
    }
    const shouldDependenciesSaveAsComponents = await consumer.shouldDependenciesSavedAsComponents([id]);
    componentWithDependencies.component.dependenciesSavedAsComponents =
      shouldDependenciesSaveAsComponents[0].saveDependenciesAsComponents;

    const manyComponentsWriter = new ManyComponentsWriter({
      consumer,
      componentsWithDependencies: [componentWithDependencies],
      installNpmPackages: shouldInstallNpmPackages(),
      override: true,
      writeConfig: false, // @todo: should write if config exists before, needs to figure out how to do it.
      verbose: false, // @todo: do we need a flag here?
      writeDists: true, // @todo: do we need a flag here?
      writePackageJson,
    });
    await manyComponentsWriter.writeAll();

    // if mergeResults, the head snap is going to be updated on a later phase when snapping with two parents
    // otherwise, update the head of the current lane or main
    if (mergeResults) {
      if (mergeResults.hasConflicts && mergeStrategy === MergeOptions.manual) {
        unmergedComponent.resolved = false;
        unmergedComponent.unmergedPaths = mergeResults.modifiedFiles.filter((f) => f.conflict).map((f) => f.filePath);
      } else {
        unmergedComponent.resolved = true;
      }
      consumer.scope.objects.unmergedComponents.addEntry(unmergedComponent);
    } else if (localLane) {
      localLane.addComponent({ id, head: remoteHead });
    } else {
      // this is main
      const modelComponent = await consumer.scope.getModelComponent(id);
      if (!consumer.isLegacy) modelComponent.setHead(remoteHead);
      consumer.scope.objects.add(modelComponent);
    }

    return { id, filesStatus };
  }

  private async abortMerge(consumer: Consumer, values: string[]): Promise<ApplyVersionResults> {
    const ids = this.getIdsForUnresolved(consumer, values);
    // @ts-ignore not clear yet what to do with other flags
    const results = await checkoutVersion(consumer, { ids, reset: true });
    ids.forEach((id) => consumer.scope.objects.unmergedComponents.removeComponent(id.name));
    await consumer.scope.objects.unmergedComponents.write();
    return { abortedComponents: results.components };
  }

  private async resolveMerge(
    consumer: Consumer,
    values: string[],
    snapMessage: string,
    build: boolean
  ): Promise<ApplyVersionResults> {
    const ids = this.getIdsForUnresolved(consumer, values);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const { snappedComponents } = await this.snapping.snap({
      legacyBitIds: BitIds.fromArray(ids),
      resolveUnmerged: true,
      build,
      message: snapMessage,
    });
    return { resolvedComponents: snappedComponents };
  }

  private async getAllComponentsStatus(
    bitIds: BitId[],
    localLaneId: LocalLaneId,
    localLaneObject: Lane | null,
    remoteTrackedLane?: TrackLane
  ): Promise<ComponentStatus[]> {
    const tmp = new Tmp(this.consumer.scope);
    try {
      const componentsStatus = await Promise.all(
        bitIds.map(async (bitId) => {
          const remoteLaneName = remoteTrackedLane ? remoteTrackedLane.remoteLane : localLaneId.name;
          const remoteScopeName = remoteTrackedLane ? remoteTrackedLane.remoteScope : bitId.scope;
          const remoteLaneId = RemoteLaneId.from(remoteLaneName, remoteScopeName as string);
          const remoteHead = await this.consumer.scope.objects.remoteLanes.getRef(remoteLaneId, bitId);
          const remoteLaneIdStr = remoteLaneId.toString();
          if (!remoteHead)
            throw new GeneralError(
              `unable to find a remote head of "${bitId.toStringWithoutVersion()}" in "${remoteLaneIdStr}"`
            );
          return this.getComponentMergeStatus(
            bitId.changeVersion(remoteHead.toString()),
            localLaneObject,
            remoteLaneIdStr
          );
        })
      );
      await tmp.clear();
      return componentsStatus;
    } catch (err: any) {
      await tmp.clear();
      throw err;
    }
  }

  private async snapResolvedComponents(
    consumer: Consumer,
    snapMessage: string,
    build: boolean
  ): Promise<null | { snappedComponents: Component[]; autoSnappedResults: AutoTagResult[] }> {
    const resolvedComponents = consumer.scope.objects.unmergedComponents.getResolvedComponents();
    logger.debug(`merge-snaps, snapResolvedComponents, total ${resolvedComponents.length.toString()} components`);
    if (!resolvedComponents.length) return null;
    const ids = BitIds.fromArray(resolvedComponents.map((r) => new BitId(r.id)));
    return this.snapping.snap({
      legacyBitIds: ids,
      build,
      message: snapMessage,
    });
  }

  private getIdsForUnresolved(consumer: Consumer, idsStr?: string[]): BitId[] {
    if (idsStr && idsStr.length) {
      const bitIds = idsStr.map((id) => consumer.getParsedId(id));
      bitIds.forEach((id) => {
        const entry = consumer.scope.objects.unmergedComponents.getEntry(id.name);
        if (!entry) {
          throw new GeneralError(`unable to merge-resolve ${id.toString()}, it is not marked as unresolved`);
        }
      });
      return bitIds;
    }
    const unresolvedComponents = consumer.scope.objects.unmergedComponents.getComponents();
    if (!unresolvedComponents.length) throw new GeneralError(`all components are resolved already, nothing to do`);
    return unresolvedComponents.map((u) => new BitId(u.id));
  }

  private getComponentsToMerge(consumer: Consumer, ids: string[]): BitId[] {
    if (hasWildcard(ids)) {
      const componentsList = new ComponentsList(consumer);
      return componentsList.listComponentsByIdsWithWildcard(ids);
    }
    return ids.map((id) => consumer.getParsedId(id));
  }

  static slots = [];
  static dependencies = [CLIAspect, WorkspaceAspect, SnappingAspect];
  static runtime = MainRuntime;
  static async provider([cli, workspace, snapping]: [CLIMain, Workspace, SnappingMain]) {
    const merging = new MergingMain(workspace, snapping);
    cli.register(new MergeCmd(merging));
    return merging;
  }
}

MergingAspect.addRuntime(MergingMain);
