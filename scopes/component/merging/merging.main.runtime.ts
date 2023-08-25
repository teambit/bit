import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import semver from 'semver';
import WorkspaceAspect, { OutsideWorkspaceError, Workspace } from '@teambit/workspace';
import { Consumer } from '@teambit/legacy/dist/consumer';
import ComponentsList from '@teambit/legacy/dist/consumer/component/components-list';
import {
  MergeStrategy,
  FailedComponents,
  FileStatus,
  ApplyVersionResult,
  getMergeStrategyInteractive,
  MergeOptions,
} from '@teambit/legacy/dist/consumer/versions-ops/merge-version';
import SnappingAspect, { SnapResults, SnappingMain, TagResults } from '@teambit/snapping';
import hasWildcard from '@teambit/legacy/dist/utils/string/has-wildcard';
import mapSeries from 'p-map-series';
import { BitId, BitIds } from '@teambit/legacy/dist/bit-id';
import { BitError } from '@teambit/bit-error';
import GeneralError from '@teambit/legacy/dist/error/general-error';
import { LaneId } from '@teambit/lane-id';
import { AutoTagResult } from '@teambit/legacy/dist/scope/component-ops/auto-tag';
import { UnmergedComponent } from '@teambit/legacy/dist/scope/lanes/unmerged-components';
import { Lane, ModelComponent } from '@teambit/legacy/dist/scope/models';
import { Ref } from '@teambit/legacy/dist/scope/objects';
import chalk from 'chalk';
import { ConfigAspect, ConfigMain } from '@teambit/config';
import RemoveAspect, { RemoveMain } from '@teambit/remove';
import { pathNormalizeToLinux } from '@teambit/legacy/dist/utils';
import { ComponentWriterAspect, ComponentWriterMain } from '@teambit/component-writer';
import ConsumerComponent from '@teambit/legacy/dist/consumer/component/consumer-component';
import ImporterAspect, { ImporterMain } from '@teambit/importer';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { compact, isEmpty } from 'lodash';
import { MergeResultsThreeWay } from '@teambit/legacy/dist/consumer/versions-ops/merge-version/three-way-merge';
import { DependencyResolverAspect, WorkspacePolicyConfigKeysNames } from '@teambit/dependency-resolver';
import {
  ApplyVersionWithComps,
  CheckoutAspect,
  CheckoutMain,
  ComponentStatusBase,
  applyModifiedVersion,
  removeFilesIfNeeded,
} from '@teambit/checkout';
import { ComponentID } from '@teambit/component-id';
import { DEPENDENCIES_FIELDS } from '@teambit/legacy/dist/constants';
import deleteComponentsFiles from '@teambit/legacy/dist/consumer/component-ops/delete-component-files';
import { SnapsDistance } from '@teambit/legacy/dist/scope/component-ops/snaps-distance';
import { InstallMain, InstallAspect } from '@teambit/install';
import { MergeCmd } from './merge-cmd';
import { MergingAspect } from './merging.aspect';
import { ConfigMergeResult } from './config-merge-result';
import { MergeStatusProvider } from './merge-status-provider';

type ResolveUnrelatedData = {
  strategy: MergeStrategy;
  headOnLane: Ref;
  unrelatedHead: Ref;
  unrelatedLaneId: LaneId;
  futureParent: Ref;
};
type PkgEntry = { name: string; version: string; force: boolean };

export type WorkspaceDepsUpdates = { [pkgName: string]: [string, string] }; // from => to
export type WorkspaceDepsConflicts = Record<WorkspacePolicyConfigKeysNames, Array<{ name: string; version: string }>>; // the pkg value is in a format of CONFLICT::OURS::THEIRS

export type ComponentMergeStatus = ComponentStatusBase & {
  unmergedMessage?: string;
  unmergedLegitimately?: boolean; // failed to merge but for a legitimate reason, such as, up-to-date
  mergeResults?: MergeResultsThreeWay | null;
  divergeData?: SnapsDistance;
  resolvedUnrelated?: ResolveUnrelatedData;
  configMergeResult?: ConfigMergeResult;
};

export type ComponentMergeStatusBeforeMergeAttempt = ComponentStatusBase & {
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

export type ApplyVersionResults = {
  components?: ApplyVersionResult[];
  version?: string;
  failedComponents?: FailedComponents[];
  removedComponents?: BitId[];
  addedComponents?: ComponentID[]; // relevant when restoreMissingComponents is true (e.g. bit lane merge-abort)
  resolvedComponents?: ConsumerComponent[]; // relevant for bit merge --resolve
  abortedComponents?: ApplyVersionResult[]; // relevant for bit merge --abort
  mergeSnapResults?: {
    snappedComponents: ConsumerComponent[];
    autoSnappedResults: AutoTagResult[];
    removedComponents?: BitIds;
  } | null;
  mergeSnapError?: Error;
  leftUnresolvedConflicts?: boolean;
  verbose?: boolean;
  newFromLane?: string[];
  newFromLaneAdded?: boolean;
  installationError?: Error; // in case the package manager failed, it won't throw, instead, it'll return error here
  compilationError?: Error; // in case the compiler failed, it won't throw, instead, it'll return error here
  workspaceDepsUpdates?: WorkspaceDepsUpdates; // in case workspace.jsonc has been updated with dependencies versions
};

export class MergingMain {
  constructor(
    private workspace: Workspace,
    private install: InstallMain,
    private snapping: SnappingMain,
    private checkout: CheckoutMain,
    private logger: Logger,
    private componentWriter: ComponentWriterMain,
    private importer: ImporterMain,
    private config: ConfigMain,
    private remove: RemoveMain
  ) {}

  async merge(
    ids: string[],
    mergeStrategy: MergeStrategy,
    abort: boolean,
    resolve: boolean,
    noSnap: boolean,
    message: string,
    build: boolean,
    skipDependencyInstallation: boolean
  ): Promise<ApplyVersionResults> {
    if (!this.workspace) throw new OutsideWorkspaceError();
    const consumer: Consumer = this.workspace.consumer;
    let mergeResults;
    if (resolve) {
      mergeResults = await this.resolveMerge(ids, message, build);
    } else if (abort) {
      mergeResults = await this.abortMerge(ids);
    } else {
      const bitIds = await this.getComponentsToMerge(consumer, ids);
      mergeResults = await this.mergeComponentsFromRemote(
        consumer,
        bitIds,
        mergeStrategy,
        noSnap,
        message,
        build,
        skipDependencyInstallation
      );
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
      .filter((componentStatus) => !componentStatus.shouldBeRemoved)
      .map((componentStatus) => ({
        id: componentStatus.id,
        failureMessage: componentStatus.unmergedMessage as string,
        unchangedLegitimately: componentStatus.unmergedLegitimately,
      }));

    const componentIdsToRemove = allComponentsStatus
      .filter((componentStatus) => componentStatus.shouldBeRemoved)
      .map((c) => c.id.changeVersion(undefined));

    const succeededComponents = allComponentsStatus.filter((componentStatus) => !componentStatus.unmergedMessage);
    // do not use Promise.all for applyVersion. otherwise, it'll write all components in parallel,
    // which can be an issue when some components are also dependencies of others
    const componentsResults = await mapSeries(
      succeededComponents,
      async ({ currentComponent, id, mergeResults, resolvedUnrelated, configMergeResult }) => {
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
          configMergeResult,
        });
      }
    );

    const allConfigMerge = compact(succeededComponents.map((c) => c.configMergeResult));

    const { workspaceDepsUpdates, workspaceDepsConflicts } = await this.updateWorkspaceJsoncWithDepsIfNeeded(
      allConfigMerge
    );

    await this.generateConfigMergeConflictFileForAll(allConfigMerge, workspaceDepsConflicts);

    if (localLane) consumer.scope.objects.add(localLane);

    await consumer.scope.objects.persist(); // persist anyway, if localLane is null it should save all main heads

    await consumer.scope.objects.unmergedComponents.write();

    await consumer.writeBitMap();

    if (componentIdsToRemove.length) {
      const compBitIdsToRemove = BitIds.fromArray(componentIdsToRemove);
      await deleteComponentsFiles(consumer, compBitIdsToRemove);
      await consumer.cleanFromBitMap(compBitIdsToRemove);
    }

    const componentsHasConfigMergeConflicts = allComponentsStatus.some((c) => c.configMergeResult?.hasConflicts());
    const leftUnresolvedConflicts = componentWithConflict && mergeStrategy === 'manual';
    if (!skipDependencyInstallation && !leftUnresolvedConflicts && !componentsHasConfigMergeConflicts) {
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
      if (noSnap || leftUnresolvedConflicts || componentsHasConfigMergeConflicts) {
        return null;
      }
      if (tag) {
        const idsToTag = allComponentsStatus.map((c) => c.id);
        const results = await this.tagAllLaneComponent(idsToTag, snapMessage, build);
        if (!results) return null;
        const { taggedComponents, autoTaggedResults, removedComponents } = results;
        return { snappedComponents: taggedComponents, autoSnappedResults: autoTaggedResults, removedComponents };
      }
      return this.snapResolvedComponents(consumer, snapMessage, build);
    };
    let mergeSnapResults: ApplyVersionResults['mergeSnapResults'] = null;
    let mergeSnapError: Error | undefined;
    const bitMapSnapshot = this.workspace.bitMap.takeSnapshot();
    try {
      mergeSnapResults = await getSnapOrTagResults();
    } catch (err: any) {
      mergeSnapError = err;
      this.workspace.bitMap.restoreFromSnapshot(bitMapSnapshot);
    }

    return {
      components: componentsResults.map((c) => c.applyVersionResult),
      failedComponents,
      removedComponents: [...componentIdsToRemove, ...(mergeSnapResults?.removedComponents || [])],
      mergeSnapResults,
      mergeSnapError,
      leftUnresolvedConflicts,
      workspaceDepsUpdates,
    };
  }

  private async generateConfigMergeConflictFileForAll(
    allConfigMerge: ConfigMergeResult[],
    workspaceDepsConflicts?: WorkspaceDepsConflicts
  ) {
    const configMergeFile = this.workspace.getConflictMergeFile();
    if (workspaceDepsConflicts) {
      const workspaceConflict = new ConfigMergeResult('WORKSPACE', 'ours', 'theirs', [
        {
          id: DependencyResolverAspect.id,
          conflict: workspaceDepsConflicts,
        },
      ]);
      allConfigMerge.unshift(workspaceConflict);
    }
    allConfigMerge.forEach((configMerge) => {
      const conflict = configMerge.generateMergeConflictFile();
      if (!conflict) return;
      configMergeFile.addConflict(configMerge.compIdStr, conflict);
    });
    if (configMergeFile.hasConflict()) {
      await configMergeFile.write();
    }
  }

  private async updateWorkspaceJsoncWithDepsIfNeeded(
    allConfigMerge: ConfigMergeResult[]
  ): Promise<{ workspaceDepsUpdates?: WorkspaceDepsUpdates; workspaceDepsConflicts?: WorkspaceDepsConflicts }> {
    const allResults = allConfigMerge.map((c) => c.getDepsResolverResult());

    // aggregate all dependencies that can be updated (not conflicting)
    const nonConflictDeps: { [pkgName: string]: string[] } = {};
    const nonConflictSources: { [pkgName: string]: string[] } = {}; // for logging/debugging purposes
    allConfigMerge.forEach((configMerge) => {
      const mergedConfig = configMerge.getDepsResolverResult()?.mergedConfig;
      if (!mergedConfig || mergedConfig === '-') return;
      const mergedConfigPolicy = mergedConfig.policy || {};
      DEPENDENCIES_FIELDS.forEach((depField) => {
        if (!mergedConfigPolicy[depField]) return;
        mergedConfigPolicy[depField].forEach((pkg: PkgEntry) => {
          if (pkg.force) return; // we only care about auto-detected dependencies
          if (nonConflictDeps[pkg.name]) {
            if (!nonConflictDeps[pkg.name].includes(pkg.version)) nonConflictDeps[pkg.name].push(pkg.version);
            nonConflictSources[pkg.name].push(configMerge.compIdStr);
            return;
          }
          nonConflictDeps[pkg.name] = [pkg.version];
          nonConflictSources[pkg.name] = [configMerge.compIdStr];
        });
      });
    });

    // aggregate all dependencies that have conflicts
    const conflictDeps: { [pkgName: string]: string[] } = {};
    const conflictDepsSources: { [pkgName: string]: string[] } = {}; // for logging/debugging purposes
    allConfigMerge.forEach((configMerge) => {
      const mergedConfigConflict = configMerge.getDepsResolverResult()?.conflict;
      if (!mergedConfigConflict) return;
      DEPENDENCIES_FIELDS.forEach((depField) => {
        if (!mergedConfigConflict[depField]) return;
        mergedConfigConflict[depField].forEach((pkg: PkgEntry) => {
          if (pkg.force) return; // we only care about auto-detected dependencies
          if (conflictDeps[pkg.name]) {
            if (!conflictDeps[pkg.name].includes(pkg.version)) conflictDeps[pkg.name].push(pkg.version);
            conflictDepsSources[pkg.name].push(configMerge.compIdStr);
            return;
          }
          conflictDeps[pkg.name] = [pkg.version];
          conflictDepsSources[pkg.name] = [configMerge.compIdStr];
        });
      });
    });

    const notConflictedPackages = Object.keys(nonConflictDeps);
    const conflictedPackages = Object.keys(conflictDeps);
    if (!notConflictedPackages.length && !conflictedPackages.length) return {};

    const workspaceConfig = this.config.workspaceConfig;
    if (!workspaceConfig) throw new Error(`updateWorkspaceJsoncWithDepsIfNeeded unable to get workspace config`);
    const depResolver = workspaceConfig.extensions.findCoreExtension(DependencyResolverAspect.id);
    const policy = depResolver?.config.policy;
    if (!policy) {
      return {};
    }

    // calculate the workspace.json updates
    const workspaceJsonUpdates = {};
    notConflictedPackages.forEach((pkgName) => {
      if (nonConflictDeps[pkgName].length > 1) {
        // we only want the deps that the other lane has them in the workspace.json and that all comps use the same dep.
        return;
      }
      DEPENDENCIES_FIELDS.forEach((depField) => {
        if (!policy[depField]?.[pkgName]) return; // doesn't exists in the workspace.json
        const currentVer = policy[depField][pkgName];
        const newVer = nonConflictDeps[pkgName][0];
        if (currentVer === newVer) return;
        workspaceJsonUpdates[pkgName] = [currentVer, newVer];
        policy[depField][pkgName] = newVer;
        this.logger.debug(
          `update workspace.jsonc: ${pkgName} from ${currentVer} to ${newVer}. Triggered by: ${nonConflictSources[
            pkgName
          ].join(', ')}`
        );
      });
    });

    // calculate the workspace.json conflicts
    const WS_DEPS_FIELDS = ['dependencies', 'peerDependencies'];
    const workspaceJsonConflicts = { dependencies: [], peerDependencies: [] };
    const conflictPackagesToRemoveFromConfigMerge: string[] = [];
    conflictedPackages.forEach((pkgName) => {
      if (conflictDeps[pkgName].length > 1) {
        // we only want the deps that the other lane has them in the workspace.json and that all comps use the same dep.
        return;
      }
      const conflictRaw = conflictDeps[pkgName][0];
      const [, currentVal, otherVal] = conflictRaw.split('::');

      WS_DEPS_FIELDS.forEach((depField) => {
        if (!policy[depField]?.[pkgName]) return;
        const currentVerInWsJson = policy[depField][pkgName];
        if (!currentVerInWsJson) return;
        // the version is coming from the workspace.jsonc
        conflictPackagesToRemoveFromConfigMerge.push(pkgName);
        if (semver.satisfies(otherVal, currentVerInWsJson)) {
          // the other version is compatible with the current version in the workspace.json
          return;
        }
        workspaceJsonConflicts[depField].push({
          name: pkgName,
          version: conflictRaw.replace(currentVal, currentVerInWsJson),
          force: false,
        });
        conflictPackagesToRemoveFromConfigMerge.push(pkgName);
        this.logger.debug(
          `conflict workspace.jsonc: ${pkgName} current: ${currentVerInWsJson}, other: ${otherVal}. Triggered by: ${conflictDepsSources[
            pkgName
          ].join(', ')}`
        );
      });
    });
    WS_DEPS_FIELDS.forEach((depField) => {
      if (isEmpty(workspaceJsonConflicts[depField])) delete workspaceJsonConflicts[depField];
    });

    if (conflictPackagesToRemoveFromConfigMerge.length) {
      allResults.forEach((result) => {
        if (result?.conflict) {
          DEPENDENCIES_FIELDS.forEach((depField) => {
            if (!result.conflict?.[depField]) return;
            result.conflict[depField] = result.conflict?.[depField].filter(
              (dep) => !conflictPackagesToRemoveFromConfigMerge.includes(dep.name)
            );
            if (!result.conflict[depField].length) delete result.conflict[depField];
          });
          if (isEmpty(result.conflict)) result.conflict = undefined;
        }
      });
    }

    if (Object.keys(workspaceJsonUpdates).length) {
      await workspaceConfig.write();
    }

    this.logger.debug('final workspace.jsonc updates', workspaceJsonUpdates);
    this.logger.debug('final workspace.jsonc conflicts', workspaceJsonConflicts);

    return {
      workspaceDepsUpdates: Object.keys(workspaceJsonUpdates).length ? workspaceJsonUpdates : undefined,
      workspaceDepsConflicts: Object.keys(workspaceJsonConflicts).length ? workspaceJsonConflicts : undefined,
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
    const mergeStatusProvider = new MergeStatusProvider(
      this.workspace,
      this.logger,
      this.importer,
      currentLane || undefined,
      otherLane || undefined,
      options
    );
    return mergeStatusProvider.getStatus(bitIds);
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
    configMergeResult,
  }: {
    currentComponent: ConsumerComponent | null | undefined;
    id: BitId;
    mergeResults: MergeResultsThreeWay | null | undefined;
    mergeStrategy: MergeStrategy;
    remoteHead: Ref;
    laneId: LaneId;
    localLane: Lane | null;
    resolvedUnrelated?: ResolveUnrelatedData;
    configMergeResult?: ConfigMergeResult;
  }): Promise<ApplyVersionWithComps> {
    const consumer = this.workspace.consumer;
    let filesStatus = {};
    const unmergedComponent: UnmergedComponent = {
      // @ts-ignore
      id: { name: id.name, scope: id.scope },
      head: remoteHead,
      laneId,
    };
    id = currentComponent ? currentComponent.id : id;

    const modelComponent = await consumer.scope.getModelComponent(id);
    const handleResolveUnrelated = () => {
      if (!currentComponent) throw new Error('currentComponent must be defined when resolvedUnrelated');
      // because when on a main, we don't allow merging lanes with unrelated. we asks users to switch to the lane
      // first and then merge with --resolve-unrelated
      if (!localLane) throw new Error('localLane must be defined when resolvedUnrelated');
      if (!resolvedUnrelated) throw new Error('resolvedUnrelated must be populated');
      localLane.addComponent({ id, head: resolvedUnrelated.headOnLane });
      unmergedComponent.unrelated = {
        unrelatedHead: resolvedUnrelated.unrelatedHead,
        futureParent: resolvedUnrelated.futureParent,
        unrelatedLaneId: resolvedUnrelated.unrelatedLaneId,
      };
      consumer.scope.objects.unmergedComponents.addEntry(unmergedComponent);
      return { applyVersionResult: { id, filesStatus }, component: currentComponent };
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
      return { applyVersionResult: { id, filesStatus }, component: currentComponent || undefined };
    }
    if (resolvedUnrelated?.strategy === 'ours') {
      markAllFilesAsUnchanged();
      return handleResolveUnrelated();
    }
    const remoteId = id.changeVersion(remoteHead.toString());
    const idToLoad = !mergeResults || mergeStrategy === MergeOptions.theirs ? remoteId : id;
    const legacyComponent = await consumer.loadComponentFromModelImportIfNeeded(idToLoad);
    if (mergeResults && mergeStrategy === MergeOptions.theirs) {
      // in this case, we don't want to update .bitmap with the version of the remote. we want to keep the same version
      legacyComponent.version = id.version;
    }
    const files = legacyComponent.files;
    files.forEach((file) => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      filesStatus[pathNormalizeToLinux(file.relative)] = FileStatus.updated;
    });

    if (mergeResults) {
      // update files according to the merge results
      const { filesStatus: modifiedStatus, modifiedFiles } = applyModifiedVersion(files, mergeResults, mergeStrategy);
      legacyComponent.files = modifiedFiles;
      filesStatus = { ...filesStatus, ...modifiedStatus };
    }

    await removeFilesIfNeeded(filesStatus, currentComponent || undefined);

    const manyComponentsWriterOpts = {
      consumer,
      components: [legacyComponent],
      skipDependencyInstallation: true,
      writeConfig: false, // @todo: should write if config exists before, needs to figure out how to do it.
    };
    await this.componentWriter.writeMany(manyComponentsWriterOpts);

    if (configMergeResult) {
      if (!legacyComponent.writtenPath) {
        throw new Error(`component.writtenPath is missing for ${id.toString()}`);
      }
      const successfullyMergedConfig = configMergeResult.getSuccessfullyMergedConfig();
      if (successfullyMergedConfig) {
        unmergedComponent.mergedConfig = successfullyMergedConfig;
        // no need to `unmergedComponents.addEntry` here. it'll be added in the next lines inside `if (mergeResults)`.
        // because if `configMergeResult` is set, `mergeResults` must be set as well. both happen on diverge.
      }
    }

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

    return { applyVersionResult: { id, filesStatus }, component: currentComponent || undefined };
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
        const remoteHead = await this.workspace.consumer.scope.objects.remoteLanes.getRef(remoteLaneId, bitId);
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
  ): Promise<SnapResults | null> {
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

  private async getComponentsToMerge(consumer: Consumer, ids: string[]): Promise<BitId[]> {
    const componentsList = new ComponentsList(consumer);
    if (!ids.length) {
      const mergePending = await componentsList.listMergePendingComponents();
      return mergePending.map((c) => c.id);
    }
    if (hasWildcard(ids)) {
      return componentsList.listComponentsByIdsWithWildcard(ids);
    }
    return ids.map((id) => consumer.getParsedId(id));
  }

  static slots = [];
  static dependencies = [
    CLIAspect,
    WorkspaceAspect,
    SnappingAspect,
    CheckoutAspect,
    InstallAspect,
    LoggerAspect,
    ComponentWriterAspect,
    ImporterAspect,
    ConfigAspect,
    RemoveAspect,
  ];
  static runtime = MainRuntime;
  static async provider([
    cli,
    workspace,
    snapping,
    checkout,
    install,
    loggerMain,
    compWriter,
    importer,
    config,
    remove,
  ]: [
    CLIMain,
    Workspace,
    SnappingMain,
    CheckoutMain,
    InstallMain,
    LoggerMain,
    ComponentWriterMain,
    ImporterMain,
    ConfigMain,
    RemoveMain
  ]) {
    const logger = loggerMain.createLogger(MergingAspect.id);
    const merging = new MergingMain(
      workspace,
      install,
      snapping,
      checkout,
      logger,
      compWriter,
      importer,
      config,
      remove
    );
    cli.register(new MergeCmd(merging));
    return merging;
  }
}

MergingAspect.addRuntime(MergingMain);
