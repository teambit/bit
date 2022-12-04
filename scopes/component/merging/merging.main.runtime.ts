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
import SnappingAspect, { SnappingMain, TagResults } from '@teambit/snapping';
import hasWildcard from '@teambit/legacy/dist/utils/string/has-wildcard';
import mapSeries from 'p-map-series';
import { BitId, BitIds } from '@teambit/legacy/dist/bit-id';
import { BitError } from '@teambit/bit-error';
import GeneralError from '@teambit/legacy/dist/error/general-error';
import { DEFAULT_LANE, LaneId } from '@teambit/lane-id';
import { AutoTagResult } from '@teambit/legacy/dist/scope/component-ops/auto-tag';
import { getDivergeData } from '@teambit/legacy/dist/scope/component-ops/get-diverge-data';
import { UnmergedComponent } from '@teambit/legacy/dist/scope/lanes/unmerged-components';
import { Lane, ModelComponent, Version } from '@teambit/legacy/dist/scope/models';
import { Ref } from '@teambit/legacy/dist/scope/objects';
import chalk from 'chalk';
import { Tmp } from '@teambit/legacy/dist/scope/repositories';
import { pathNormalizeToLinux } from '@teambit/legacy/dist/utils';
import ManyComponentsWriter from '@teambit/legacy/dist/consumer/component-ops/many-components-writer';
import ConsumerComponent from '@teambit/legacy/dist/consumer/component/consumer-component';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { applyModifiedVersion } from '@teambit/legacy/dist/consumer/versions-ops/checkout-version';
import threeWayMerge, {
  MergeResultsThreeWay,
} from '@teambit/legacy/dist/consumer/versions-ops/merge-version/three-way-merge';
import { NoCommonSnap } from '@teambit/legacy/dist/scope/exceptions/no-common-snap';
import { CheckoutAspect, CheckoutMain } from '@teambit/checkout';
import { ComponentID } from '@teambit/component-id';
import { SnapsDistance } from '@teambit/legacy/dist/scope/component-ops/snaps-distance';
import { InstallMain, InstallAspect } from '@teambit/install';
import { MergeCmd } from './merge-cmd';
import { MergingAspect } from './merging.aspect';

type ResolveUnrelatedData = { strategy: MergeStrategy; head: Ref };

export type ComponentMergeStatus = {
  currentComponent?: ConsumerComponent | null;
  componentFromModel?: Version;
  id: BitId;
  unmergedMessage?: string;
  unmergedLegitimately?: boolean; // failed to merge but for a legitimate reason, such as, up-to-date
  mergeResults?: MergeResultsThreeWay | null;
  divergeData?: SnapsDistance;
  resolvedUnrelated?: ResolveUnrelatedData;
};

export type ComponentMergeStatusBeforeMergeAttempt = {
  currentComponent?: ConsumerComponent | null;
  componentFromModel?: Version;
  id: BitId;
  unmergedMessage?: string;
  unmergedLegitimately?: boolean; // failed to merge but for a legitimate reason, such as, up-to-date
  divergeData?: SnapsDistance;
  resolvedUnrelated?: ResolveUnrelatedData;
  mergeProps?: {
    otherLaneHead: Ref;
    currentId: BitId;
    modelComponent: ModelComponent;
  };
};

export class MergingMain {
  private consumer: Consumer;
  constructor(
    private workspace: Workspace,
    private install: InstallMain,
    private snapping: SnappingMain,
    private checkout: CheckoutMain,
    private logger: Logger
  ) {
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
    build: boolean,
    skipDependencyInstallation: boolean
  ): Promise<ApplyVersionResults> {
    if (!this.workspace) throw new ConsumerNotFound();
    const consumer: Consumer = this.workspace.consumer;
    let mergeResults;
    const firstValue = R.head(values);
    if (resolve) {
      mergeResults = await this.resolveMerge(values, message, build);
    } else if (abort) {
      mergeResults = await this.abortMerge(values);
    } else if (!BitId.isValidVersion(firstValue)) {
      const bitIds = this.getComponentsToMerge(consumer, values);
      // @todo: version could be the lane only or remote/lane
      mergeResults = await this.mergeComponentsFromRemote(
        consumer,
        bitIds,
        mergeStrategy,
        noSnap,
        message,
        build,
        skipDependencyInstallation
      );
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
    build: boolean,
    skipDependencyInstallation: boolean
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
      laneId: currentLaneId,
      localLane: currentLaneObject,
      noSnap,
      snapMessage,
      build,
      skipDependencyInstallation,
    });
  }

  /**
   * merge multiple components according to the "allComponentsStatus".
   */
  async mergeSnaps({
    mergeStrategy,
    allComponentsStatus,
    laneId,
    localLane,
    noSnap,
    tag,
    snapMessage,
    build,
    skipDependencyInstallation,
  }: {
    mergeStrategy: MergeStrategy;
    allComponentsStatus: ComponentMergeStatus[];
    laneId: LaneId;
    localLane: Lane | null;
    noSnap: boolean;
    tag?: boolean;
    snapMessage: string;
    build: boolean;
    skipDependencyInstallation?: boolean;
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
    const componentsResults = await mapSeries(
      succeededComponents,
      async ({ currentComponent, id, mergeResults, resolvedUnrelated }) => {
        const modelComponent = await consumer.scope.getModelComponent(id);
        const updatedLaneId = laneId.isDefault() ? LaneId.from(laneId.name, id.scope as string) : laneId;
        return this.applyVersion({
          currentComponent,
          id,
          mergeResults,
          mergeStrategy,
          remoteHead: modelComponent.getRef(id.version as string) as Ref,
          laneId: updatedLaneId,
          localLane,
          resolvedUnrelated,
        });
      }
    );

    if (localLane) consumer.scope.objects.add(localLane);

    await consumer.scope.objects.persist(); // persist anyway, if localLane is null it should save all main heads

    await consumer.scope.objects.unmergedComponents.write();

    await consumer.writeBitMap();

    const leftUnresolvedConflicts = componentWithConflict && mergeStrategy === 'manual';
    if (!skipDependencyInstallation && !leftUnresolvedConflicts) {
      try {
        await this.install.install(undefined, {
          dedupe: true,
          updateExisting: false,
          import: false,
        });
      } catch (err: any) {
        this.logger.error(`failed installing packages`, err);
        this.logger.consoleError(`failed installing packages, see the log for full stacktrace. error: ${err.message}`);
      }
    }

    const getSnapOrTagResults = async () => {
      // if one of the component has conflict, don't snap-merge. otherwise, some of the components would be snap-merged
      // and some not. besides the fact that it could by mistake tag dependent, it's a confusing state. better not snap.
      if (noSnap || leftUnresolvedConflicts) {
        return null;
      }
      if (tag) {
        const idsToTag = allComponentsStatus.map((c) => c.id);
        const results = await this.tagAllLaneComponent(idsToTag, snapMessage, build);
        if (!results) return null;
        const { taggedComponents, autoTaggedResults } = results;
        return { snappedComponents: taggedComponents, autoSnappedResults: autoTaggedResults };
      }
      return this.snapResolvedComponents(consumer, snapMessage, build);
    };
    let mergeSnapResults: ApplyVersionResults['mergeSnapResults'] = null;
    let mergeSnapError: Error | undefined;
    try {
      mergeSnapResults = await getSnapOrTagResults();
    } catch (err: any) {
      mergeSnapError = err;
    }

    return {
      components: componentsResults,
      failedComponents,
      mergeSnapResults,
      mergeSnapError,
      leftUnresolvedConflicts,
    };
  }

  /**
   * this function gets called from two different commands:
   * 1. "bit merge <ids...>", when merging a component from a remote to the local.
   * in this case, the remote and local are on the same lane or both on main.
   * 2. "bit lane merge", when merging from one lane to another.
   */
  async getMergeStatus(
    bitIds: BitId[], // the id.version is the version we want to merge to the current component
    currentLane: Lane | null, // currently checked out lane. if on main, then it's null.
    otherLane?: Lane | null, // the lane we want to merged to our lane. (null if it's "main").
    options?: { resolveUnrelated?: MergeStrategy; ignoreConfigChanges?: boolean }
  ): Promise<ComponentMergeStatus[]> {
    const componentStatusBeforeMergeAttempt = await Promise.all(
      bitIds.map((id) => this.getComponentStatusBeforeMergeAttempt(id, currentLane, options))
    );

    const toImport = componentStatusBeforeMergeAttempt
      .map((compStatus) => {
        if (!compStatus.divergeData || !compStatus.divergeData.commonSnapBeforeDiverge) return [];
        return [compStatus.id.changeVersion(compStatus.divergeData.commonSnapBeforeDiverge.toString())];
      })
      .flat();

    await this.consumer.scope.scopeImporter.importManyIfMissingWithoutDeps({
      ids: BitIds.fromArray(toImport),
      lane: otherLane || undefined,
    });

    const compStatusNotNeedMerge = componentStatusBeforeMergeAttempt.filter(
      (c) => !c.mergeProps
    ) as ComponentMergeStatus[];
    const compStatusNeedMerge = componentStatusBeforeMergeAttempt.filter((c) => c.mergeProps);

    const otherLaneName = otherLane ? otherLane.toLaneId().toString() : DEFAULT_LANE;
    const getComponentsStatusNeedMerge = async (): Promise<ComponentMergeStatus[]> => {
      const tmp = new Tmp(this.consumer.scope);
      try {
        const componentsStatus = await Promise.all(
          compStatusNeedMerge.map((compStatus) => this.getComponentMergeStatus(currentLane, otherLaneName, compStatus))
        );
        await tmp.clear();
        return componentsStatus;
      } catch (err: any) {
        await tmp.clear();
        throw err;
      }
    };
    const results = await getComponentsStatusNeedMerge();
    results.push(...compStatusNotNeedMerge);
    return results;
  }

  private async getComponentStatusBeforeMergeAttempt(
    id: BitId, // the id.version is the version we want to merge to the current component
    localLane: Lane | null, // currently checked out lane. if on main, then it's null.
    options?: { resolveUnrelated?: MergeStrategy; ignoreConfigChanges?: boolean }
  ): Promise<ComponentMergeStatusBeforeMergeAttempt> {
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
    if (unmerged) {
      return returnUnmerged(
        `component ${id.toStringWithoutVersion()} is in during-merge state a previous merge, please snap/tag it first (or use bit merge --resolve/--abort)`
      );
    }
    const repo = consumer.scope.objects;
    const version = id.version as string;
    const otherLaneHead = modelComponent.getRef(version);
    const existingBitMapId = consumer.bitMap.getBitIdIfExist(id, { ignoreVersion: true });
    const componentOnLane: Version = await modelComponent.loadVersion(version, consumer.scope.objects);
    if (componentOnLane.isRemoved()) {
      return returnUnmerged(`component has been removed`, true);
    }
    const getCurrentId = () => {
      if (existingBitMapId) return existingBitMapId;
      if (localLane) {
        const idOnLane = localLane.getComponent(id);
        if (!idOnLane) return null;
        return idOnLane.id.changeVersion(idOnLane.head.toString());
      }
      // it's on main
      const head = modelComponent.getHeadAsTagIfExist();
      if (head) {
        return id.changeVersion(head);
      }
      return null;
    };
    const currentId = getCurrentId();
    if (!currentId) {
      const divergeData = await getDivergeData({ repo, modelComponent, targetHead: otherLaneHead, throws: false });
      return { currentComponent: null, componentFromModel: componentOnLane, id, divergeData };
    }
    const getCurrentComponent = () => {
      if (existingBitMapId) return consumer.loadComponent(existingBitMapId);
      return consumer.scope.getConsumerComponent(currentId);
    };
    const currentComponent = await getCurrentComponent();
    const isModified = async () => {
      const componentModificationStatus = await consumer.getComponentStatusById(currentComponent.id);
      if (!componentModificationStatus.modified) return false;
      if (!existingBitMapId) return false;
      const baseComponent = await modelComponent.loadVersion(
        existingBitMapId.version as string,
        consumer.scope.objects
      );
      return options?.ignoreConfigChanges
        ? consumer.isComponentSourceCodeModified(baseComponent, currentComponent)
        : true;
    };

    const isComponentModified = await isModified();

    if (isComponentModified) {
      return returnUnmerged(`component is modified, please snap/tag it first`);
    }
    if (!otherLaneHead) {
      throw new Error(`merging: unable finding a hash for the version ${version} of ${id.toString()}`);
    }
    const divergeData = await getDivergeData({
      repo,
      modelComponent,
      targetHead: otherLaneHead,
      throws: false,
    });
    if (divergeData.err) {
      const mainHead = modelComponent.head;
      if (divergeData.err instanceof NoCommonSnap && options?.resolveUnrelated && mainHead) {
        const hasResolvedFromMain = async (hashToCompare: Ref | null) => {
          const divergeDataFromMain = await getDivergeData({
            repo,
            modelComponent,
            sourceHead: hashToCompare,
            targetHead: mainHead,
            throws: false,
          });
          if (!divergeDataFromMain.err) return true;
          return !(divergeDataFromMain.err instanceof NoCommonSnap);
        };
        const hasResolvedLocally = await hasResolvedFromMain(modelComponent.getHeadRegardlessOfLane() as Ref);
        const hasResolvedRemotely = await hasResolvedFromMain(otherLaneHead);
        if (!hasResolvedLocally && !hasResolvedRemotely) {
          return returnUnmerged(
            `unable to traverse ${currentComponent.id.toString()} history. the main-head ${mainHead.toString()} doesn't appear in both lanes, it was probably created in each lane separately`
          );
        }
        const versionToSaveInLane = hasResolvedLocally ? currentComponent.id.version : id.version;
        const resolvedRef = modelComponent.getRef(versionToSaveInLane as string);
        if (!resolvedRef) throw new Error(`unable to get ref of "${versionToSaveInLane}" for "${id.toString()}"`);
        if (options?.resolveUnrelated === 'theirs') {
          // just override with the model data
          return {
            currentComponent,
            componentFromModel: componentOnLane,
            id,
            divergeData,
            resolvedUnrelated: { strategy: 'theirs', head: resolvedRef },
          };
        }
        if (options?.resolveUnrelated === 'ours') {
          return {
            currentComponent,
            id,
            divergeData,
            resolvedUnrelated: { strategy: 'ours', head: resolvedRef },
          };
        }
        throw new Error(
          `unsupported strategy "${options?.resolveUnrelated}" of resolve-unrelated. supported strategies are: [ours, theirs]`
        );
      }
      return returnUnmerged(
        `unable to traverse ${currentComponent.id.toString()} history. error: ${divergeData.err.message}`
      );
    }
    if (!divergeData.isDiverged()) {
      if (divergeData.isSourceAhead()) {
        // do nothing!
        return returnUnmerged(`component ${currentComponent.id.toString()} is ahead, nothing to merge`, true);
      }
      if (divergeData.isTargetAhead()) {
        // just override with the model data
        return {
          currentComponent,
          componentFromModel: componentOnLane,
          id,
          divergeData,
        };
      }
      // we know that localHead and remoteHead are set, so if none of them is ahead they must be equal
      return returnUnmerged(`component ${currentComponent.id.toString()} is already merged`, true);
    }

    // it's diverged and needs merge operation
    const mergeProps = {
      otherLaneHead,
      currentId,
      modelComponent,
    };
    return { currentComponent, id, divergeData, mergeProps };
  }

  private async getComponentMergeStatus(
    localLane: Lane | null, // currently checked out lane. if on main, then it's null.
    otherLaneName: string, // the lane name we want to merged to our lane. (can be also "main").
    componentMergeStatusBeforeMergeAttempt: ComponentMergeStatusBeforeMergeAttempt
  ) {
    const { id, divergeData, currentComponent, mergeProps } = componentMergeStatusBeforeMergeAttempt;
    if (!mergeProps) throw new Error(`getDivergedMergeStatus, mergeProps is missing for ${id.toString()}`);
    const { otherLaneHead, currentId, modelComponent } = mergeProps;
    const consumer = this.workspace.consumer;
    const repo = consumer.scope.objects;
    if (!divergeData) throw new Error(`getDivergedMergeStatus, divergeData is missing for ${id.toString()}`);
    if (!currentComponent) throw new Error(`getDivergedMergeStatus, currentComponent is missing for ${id.toString()}`);

    const baseSnap = divergeData.commonSnapBeforeDiverge as Ref; // must be set when isTrueMerge
    const baseComponent: Version = await modelComponent.loadVersion(baseSnap.toString(), repo);
    const otherComponent: Version = await modelComponent.loadVersion(otherLaneHead.toString(), repo);
    const currentLaneName = localLane?.toLaneId().toString() || 'main';
    const mergeResults = await threeWayMerge({
      consumer,
      otherComponent,
      otherLabel: `${otherLaneHead.toString()} (${otherLaneName === currentLaneName ? 'incoming' : otherLaneName})`,
      currentComponent,
      currentLabel: `${currentId.version} (${currentLaneName === otherLaneName ? 'current' : currentLaneName})`,
      baseComponent,
    });
    return { currentComponent, id, mergeResults, divergeData };
  }

  private async applyVersion({
    currentComponent,
    id,
    mergeResults,
    mergeStrategy,
    remoteHead,
    laneId,
    localLane,
    resolvedUnrelated,
  }: {
    currentComponent: ConsumerComponent | null | undefined;
    id: BitId;
    mergeResults: MergeResultsThreeWay | null | undefined;
    mergeStrategy: MergeStrategy;
    remoteHead: Ref;
    laneId: LaneId;
    localLane: Lane | null;
    resolvedUnrelated?: ResolveUnrelatedData;
  }): Promise<ApplyVersionResult> {
    const consumer = this.workspace.consumer;
    let filesStatus = {};
    const unmergedComponent: UnmergedComponent = {
      // @ts-ignore
      id: { name: id.name, scope: id.scope },
      head: remoteHead,
      remote: laneId.scope, // @todo: remove. it has been deprecated around 0.0.832
      lane: laneId.name, // @todo: remove. it has been deprecated around 0.0.832
      laneId,
    };
    id = currentComponent ? currentComponent.id : id;

    const modelComponent = await consumer.scope.getModelComponent(id);
    const handleResolveUnrelated = () => {
      if (!currentComponent) throw new Error('currentComponent must be defined when resolvedUnrelated');
      if (!localLane) throw new Error('localLane must be defined when resolvedUnrelated');
      if (!resolvedUnrelated?.head) throw new Error('resolvedUnrelated must have head prop');
      localLane.addComponent({ id, head: resolvedUnrelated.head });
      const head = modelComponent.getRef(currentComponent.id.version as string);
      if (!head) throw new Error(`unable to get the head for resolved-unrelated ${id.toString()}`);
      unmergedComponent.laneId = localLane.toLaneId();
      unmergedComponent.head = head;
      unmergedComponent.unrelated = true;
      consumer.scope.objects.unmergedComponents.addEntry(unmergedComponent);
      return { id, filesStatus };
    };

    const markAllFilesAsUnchanged = () => {
      if (!currentComponent) throw new Error(`applyVersion expect to get currentComponent for ${id.toString()}`);
      currentComponent.files.forEach((file) => {
        filesStatus[pathNormalizeToLinux(file.relative)] = FileStatus.unchanged;
      });
    };
    if (mergeResults && mergeResults.hasConflicts && mergeStrategy === MergeOptions.ours) {
      markAllFilesAsUnchanged();
      consumer.scope.objects.unmergedComponents.addEntry(unmergedComponent);
      return { id, filesStatus };
    }
    if (resolvedUnrelated?.strategy === 'ours') {
      markAllFilesAsUnchanged();
      return handleResolveUnrelated();
    }
    const remoteId = id.changeVersion(remoteHead.toString());
    const idToLoad = !mergeResults || mergeStrategy === MergeOptions.theirs ? remoteId : id;
    const componentWithDependencies = await consumer.loadComponentWithDependenciesFromModel(idToLoad);
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

    const manyComponentsWriter = new ManyComponentsWriter({
      consumer,
      componentsWithDependencies: [componentWithDependencies],
      installNpmPackages: false,
      override: true,
      writeConfig: false, // @todo: should write if config exists before, needs to figure out how to do it.
      verbose: false, // @todo: do we need a flag here?
    });
    await manyComponentsWriter.writeAll();

    // if mergeResults, the head snap is going to be updated on a later phase when snapping with two parents
    // otherwise, update the head of the current lane or main
    if (mergeResults) {
      if (mergeResults.hasConflicts && mergeStrategy === MergeOptions.manual) {
        unmergedComponent.unmergedPaths = mergeResults.modifiedFiles.filter((f) => f.conflict).map((f) => f.filePath);
      }
      consumer.scope.objects.unmergedComponents.addEntry(unmergedComponent);
    } else if (localLane) {
      if (resolvedUnrelated) {
        // must be "theirs"
        return handleResolveUnrelated();
      }
      localLane.addComponent({ id, head: remoteHead });
    } else {
      // this is main
      modelComponent.setHead(remoteHead);
      // mark it as local, otherwise, when importing this component from a remote, it'll override it.
      modelComponent.markVersionAsLocal(remoteHead.toString());
      consumer.scope.objects.add(modelComponent);
    }

    return { id, filesStatus };
  }

  private async abortMerge(values: string[]): Promise<ApplyVersionResults> {
    const consumer = this.workspace.consumer;
    const ids = await this.getIdsForUnmerged(values);
    const results = await this.checkout.checkout({ ids, reset: true });
    ids.forEach((id) => consumer.scope.objects.unmergedComponents.removeComponent(id.fullName));
    await consumer.scope.objects.unmergedComponents.write();
    return { abortedComponents: results.components };
  }

  private async resolveMerge(values: string[], snapMessage: string, build: boolean): Promise<ApplyVersionResults> {
    const ids = await this.getIdsForUnmerged(values);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const { snappedComponents } = await this.snapping.snap({
      legacyBitIds: BitIds.fromArray(ids.map((id) => id._legacy)),
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
    const ids = await Promise.all(
      bitIds.map(async (bitId) => {
        const remoteScopeName = laneId.isDefault() ? bitId.scope : laneId.scope;
        const remoteLaneId = LaneId.from(laneId.name, remoteScopeName as string);
        const remoteHead = await this.consumer.scope.objects.remoteLanes.getRef(remoteLaneId, bitId);
        const laneIdStr = remoteLaneId.toString();
        if (!remoteHead) {
          throw new BitError(`unable to find a remote head of "${bitId.toStringWithoutVersion()}" in "${laneIdStr}"`);
        }
        return bitId.changeVersion(remoteHead.toString());
      })
    );

    return this.getMergeStatus(ids, localLaneObject, localLaneObject);
  }

  private async snapResolvedComponents(
    consumer: Consumer,
    snapMessage: string,
    build: boolean
  ): Promise<null | { snappedComponents: ConsumerComponent[]; autoSnappedResults: AutoTagResult[] }> {
    const unmergedComponents = consumer.scope.objects.unmergedComponents.getComponents();
    this.logger.debug(`merge-snaps, snapResolvedComponents, total ${unmergedComponents.length.toString()} components`);
    if (!unmergedComponents.length) return null;
    const ids = BitIds.fromArray(unmergedComponents.map((r) => new BitId(r.id)));
    return this.snapping.snap({
      legacyBitIds: ids,
      build,
      message: snapMessage,
    });
  }

  private async tagAllLaneComponent(idsToTag: BitId[], tagMessage: string, build: boolean): Promise<TagResults | null> {
    const ids = idsToTag.map((id) => {
      return id.toStringWithoutVersion();
    });
    this.logger.debug(`merge-snaps, tagResolvedComponents, total ${idsToTag.length.toString()} components`);
    return this.snapping.tag({
      ids,
      build,
      message: tagMessage,
      unmodified: true,
    });
  }

  private async getIdsForUnmerged(idsStr?: string[]): Promise<ComponentID[]> {
    if (idsStr && idsStr.length) {
      const componentIds = await this.workspace.resolveMultipleComponentIds(idsStr);
      componentIds.forEach((id) => {
        const entry = this.workspace.consumer.scope.objects.unmergedComponents.getEntry(id.fullName);
        if (!entry) {
          throw new GeneralError(`unable to merge-resolve ${id.toString()}, it is not marked as unresolved`);
        }
      });
      return componentIds;
    }
    const unresolvedComponents = this.workspace.consumer.scope.objects.unmergedComponents.getComponents();
    if (!unresolvedComponents.length) throw new GeneralError(`all components are resolved already, nothing to do`);
    return unresolvedComponents.map((u) => ComponentID.fromLegacy(new BitId(u.id)));
  }

  private getComponentsToMerge(consumer: Consumer, ids: string[]): BitId[] {
    if (hasWildcard(ids)) {
      const componentsList = new ComponentsList(consumer);
      return componentsList.listComponentsByIdsWithWildcard(ids);
    }
    return ids.map((id) => consumer.getParsedId(id));
  }

  static slots = [];
  static dependencies = [CLIAspect, WorkspaceAspect, SnappingAspect, CheckoutAspect, InstallAspect, LoggerAspect];
  static runtime = MainRuntime;
  static async provider([cli, workspace, snapping, checkout, install, loggerMain]: [
    CLIMain,
    Workspace,
    SnappingMain,
    CheckoutMain,
    InstallMain,
    LoggerMain
  ]) {
    const logger = loggerMain.createLogger(MergingAspect.id);
    const merging = new MergingMain(workspace, install, snapping, checkout, logger);
    cli.register(new MergeCmd(merging));
    return merging;
  }
}

MergingAspect.addRuntime(MergingMain);
