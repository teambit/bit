import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import R from 'ramda';
import { Consumer } from '@teambit/legacy/dist/consumer';
import ComponentsList from '@teambit/legacy/dist/consumer/component/components-list';
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
import { BitError } from '@teambit/bit-error';
import GeneralError from '@teambit/legacy/dist/error/general-error';
import { LaneId } from '@teambit/lane-id';
import logger from '@teambit/legacy/dist/logger/logger';
import { AutoTagResult } from '@teambit/legacy/dist/scope/component-ops/auto-tag';
import { getDivergeData } from '@teambit/legacy/dist/scope/component-ops/get-diverge-data';
import { UnmergedComponent } from '@teambit/legacy/dist/scope/lanes/unmerged-components';
import { Lane, Version } from '@teambit/legacy/dist/scope/models';
import { Ref } from '@teambit/legacy/dist/scope/objects';
import chalk from 'chalk';
import { Tmp } from '@teambit/legacy/dist/scope/repositories';
import { pathNormalizeToLinux } from '@teambit/legacy/dist/utils';
import ManyComponentsWriter from '@teambit/legacy/dist/consumer/component-ops/many-components-writer';
import Component from '@teambit/legacy/dist/consumer/component/consumer-component';
import checkoutVersion, { applyModifiedVersion } from '@teambit/legacy/dist/consumer/versions-ops/checkout-version';
import threeWayMerge, {
  MergeResultsThreeWay,
} from '@teambit/legacy/dist/consumer/versions-ops/merge-version/three-way-merge';
import { DivergeData } from '@teambit/legacy/dist/scope/component-ops/diverge-data';
import { MergeCmd } from './merge-cmd';
import { MergingAspect } from './merging.aspect';

export type ComponentMergeStatus = {
  componentFromFS?: Component | null;
  componentFromModel?: Version;
  id: BitId;
  unmergedMessage?: string;
  unmergedLegitimately?: boolean; // failed to merge but for a legitimate reason, such as, up-to-date
  mergeResults?: MergeResultsThreeWay | null;
  divergeData?: DivergeData;
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
    const currentLaneId = consumer.getCurrentLaneId();
    const currentLaneObject = await consumer.getCurrentLaneObject();
    const allComponentsStatus = await this.getAllComponentsStatus(bitIds, currentLaneId, currentLaneObject);
    const failedComponents = allComponentsStatus.filter((c) => c.unmergedMessage && !c.unmergedLegitimately);
    if (failedComponents.length) {
      const failureMsgs = failedComponents
        .map(
          (failedComponent) =>
            `${chalk.bold(failedComponent.id.toString())} - ${chalk.red(failedComponent.unmergedMessage as string)}`
        )
        .join('\n');
      throw new BitError(`unable to merge due to the following failures:\n${failureMsgs}`);
    }

    return this.mergeSnaps({
      mergeStrategy,
      allComponentsStatus,
      remoteName: currentLaneId.isDefault() ? null : currentLaneId.scope,
      laneId: currentLaneId,
      localLane: currentLaneObject,
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
    allComponentsStatus: ComponentMergeStatus[];
    remoteName: string | null;
    laneId: LaneId;
    localLane: Lane | null;
    noSnap: boolean;
    snapMessage: string;
    build: boolean;
  }): Promise<ApplyVersionResults> {
    const consumer = this.workspace.consumer;
    const componentWithConflict = allComponentsStatus.find(
      (component) => component.mergeResults && component.mergeResults.hasConflicts
    );
    if (componentWithConflict && !mergeStrategy) {
      mergeStrategy = await getMergeStrategyInteractive();
    }
    const failedComponents: FailedComponents[] = allComponentsStatus
      .filter((componentStatus) => componentStatus.unmergedMessage)
      .map((componentStatus) => ({
        id: componentStatus.id,
        failureMessage: componentStatus.unmergedMessage as string,
        unchangedLegitimately: componentStatus.unmergedLegitimately,
      }));
    const succeededComponents = allComponentsStatus.filter((componentStatus) => !componentStatus.unmergedMessage);
    // do not use Promise.all for applyVersion. otherwise, it'll write all components in parallel,
    // which can be an issue when some components are also dependencies of others
    const componentsResults = await mapSeries(succeededComponents, async ({ componentFromFS, id, mergeResults }) => {
      const modelComponent = await consumer.scope.getModelComponent(id);
      return this.applyVersion({
        consumer,
        componentFromFS,
        id,
        mergeResults,
        mergeStrategy,
        remoteHead: modelComponent.getRef(id.version as string) as Ref,
        remoteName: remoteName || componentFromFS?.scope || null,
        laneId,
        localLane,
      });
    });

    if (localLane) consumer.scope.objects.add(localLane);

    await consumer.scope.objects.persist(); // persist anyway, if localLane is null it should save all main heads

    await consumer.scope.objects.unmergedComponents.write();

    // if one of the component has conflict, don't snap-merge. otherwise, some of the components would be snap-merged
    // and some not. except the fact that it could by mistake tag dependent, it's a confusing state. better not snap.
    const mergeSnapResults =
      noSnap || componentWithConflict ? null : await this.snapResolvedComponents(consumer, snapMessage, build);

    return {
      components: componentsResults,
      failedComponents,
      mergeSnapResults,
      conflictsFound: Boolean(componentWithConflict),
    };
  }

  /**
   * this function gets called from two different commands:
   * 1. "bit merge <ids...>", when merging a component from a remote to the local.
   * in this case, the remote and local are on the same lane or both on main.
   * 2. "bit lane merge", when merging from one lane to another.
   * @param id
   * @param localLane
   * @param otherLaneName
   * @param existingOnWorkspaceOnly
   * @returns
   */
  async getComponentMergeStatus(
    id: BitId, // the id.version is the version we want to merge to the current component
    localLane: Lane | null, // currently checked out lane. if on main, then it's null.
    otherLaneName: string // the lane name we want to merged to our lane. (can be also "main").
  ): Promise<ComponentMergeStatus> {
    const consumer = this.workspace.consumer;
    const componentStatus: ComponentMergeStatus = { id };
    const returnUnmerged = (msg: string, unmergedLegitimately = false) => {
      componentStatus.unmergedMessage = msg;
      componentStatus.unmergedLegitimately = unmergedLegitimately;
      return componentStatus;
    };
    const modelComponent = await consumer.scope.getModelComponentIfExist(id);
    if (!modelComponent) {
      return returnUnmerged(
        `component ${id.toString()} is on the lane/main but its objects were not found, please re-import the lane`
      );
    }
    const unmerged = consumer.scope.objects.unmergedComponents.getEntry(id.name);
    if (unmerged && unmerged.resolved === false) {
      return returnUnmerged(
        `component ${id.toStringWithoutVersion()} has conflicts that need to be resolved first, please use bit merge --resolve/--abort`
      );
    }
    const version = id.version as string;
    const existingBitMapId = consumer.bitMap.getBitIdIfExist(id, { ignoreVersion: true });
    const existOnCurrentLane = existingBitMapId && consumer.bitMap.isIdAvailableOnCurrentLane(existingBitMapId);
    const componentOnLane: Version = await modelComponent.loadVersion(version, consumer.scope.objects);
    if (!existingBitMapId || !existOnCurrentLane) {
      return { componentFromFS: null, componentFromModel: componentOnLane, id, mergeResults: null };
    }
    const currentlyUsedVersion = existingBitMapId.version;
    if (currentlyUsedVersion === version) {
      // @todo: maybe this check is not needed as we check for diverge later on
      if (localLane || modelComponent.hasHead()) {
        return returnUnmerged(`component ${id.toStringWithoutVersion()} is already merged`, true);
      }
    }
    const component = await consumer.loadComponent(existingBitMapId);
    const componentModificationStatus = await consumer.getComponentStatusById(component.id);
    if (componentModificationStatus.modified) {
      return returnUnmerged(
        `unable to merge ${id.toStringWithoutVersion()}, the component is modified, please snap/tag it first`
      );
    }
    const repo = consumer.scope.objects;
    const laneHeadIsDifferentThanCheckedOut =
      localLane && currentlyUsedVersion && modelComponent.laneHeadLocal?.toString() !== currentlyUsedVersion;
    const localHead = laneHeadIsDifferentThanCheckedOut ? Ref.from(currentlyUsedVersion) : null;

    const otherLaneHead = modelComponent.getRef(version);
    if (!otherLaneHead) {
      throw new Error(`merging: unable finding a hash for the version ${version} of ${id.toString()}`);
    }
    const divergeData = await getDivergeData(repo, modelComponent, otherLaneHead, localHead, false);
    if (divergeData.err) {
      return returnUnmerged(`unable to traverse ${component.id.toString()} history. error: ${divergeData.err.message}`);
    }
    if (!divergeData.isDiverged()) {
      if (divergeData.isLocalAhead()) {
        // do nothing!
        return returnUnmerged(`component ${component.id.toString()} is ahead, nothing to merge`, true);
      }
      if (divergeData.isRemoteAhead()) {
        // just override with the model data
        return {
          componentFromFS: component,
          componentFromModel: componentOnLane,
          id,
          mergeResults: null,
          divergeData,
        };
      }
      // we know that localHead and remoteHead are set, so if none of them is ahead they must be equal
      return returnUnmerged(`component ${component.id.toString()} is already merged`, true);
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
    return { componentFromFS: component, id, mergeResults, divergeData };
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
      const { filesStatus: modifiedStatus, modifiedFiles } = applyModifiedVersion(files, mergeResults, mergeStrategy);
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
      modelComponent.setHead(remoteHead);
      // mark it as local, otherwise, when importing this component from a remote, it'll override it.
      modelComponent.markVersionAsLocal(remoteHead.toString());
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
    laneId: LaneId,
    localLaneObject: Lane | null
  ): Promise<ComponentMergeStatus[]> {
    const tmp = new Tmp(this.consumer.scope);
    try {
      const componentsStatus = await Promise.all(
        bitIds.map(async (bitId) => {
          const remoteScopeName = laneId.isDefault() ? bitId.scope : laneId.scope;
          const remoteLaneId = LaneId.from(laneId.name, remoteScopeName as string);
          const remoteHead = await this.consumer.scope.objects.remoteLanes.getRef(remoteLaneId, bitId);
          const laneIdStr = remoteLaneId.toString();
          if (!remoteHead)
            throw new BitError(`unable to find a remote head of "${bitId.toStringWithoutVersion()}" in "${laneIdStr}"`);
          return this.getComponentMergeStatus(bitId.changeVersion(remoteHead.toString()), localLaneObject, laneIdStr);
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
