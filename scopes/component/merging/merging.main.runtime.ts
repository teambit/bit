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
import { ConfigAspect, ConfigMain } from '@teambit/config';
import RemoveAspect, { RemoveMain } from '@teambit/remove';
import { Tmp } from '@teambit/legacy/dist/scope/repositories';
import { pathNormalizeToLinux } from '@teambit/legacy/dist/utils';
import { ComponentWriterAspect, ComponentWriterMain } from '@teambit/component-writer';
import ConsumerComponent from '@teambit/legacy/dist/consumer/component/consumer-component';
import ImporterAspect, { ImporterMain } from '@teambit/importer';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { compact, isEmpty } from 'lodash';
import threeWayMerge, {
  MergeResultsThreeWay,
} from '@teambit/legacy/dist/consumer/versions-ops/merge-version/three-way-merge';
import { NoCommonSnap } from '@teambit/legacy/dist/scope/exceptions/no-common-snap';
import { DependencyResolverAspect, WorkspacePolicyConfigKeysNames } from '@teambit/dependency-resolver';
import { CheckoutAspect, CheckoutMain, applyModifiedVersion } from '@teambit/checkout';
import { ComponentID } from '@teambit/component-id';
import { DEPENDENCIES_FIELDS } from '@teambit/legacy/dist/constants';
import { SnapsDistance } from '@teambit/legacy/dist/scope/component-ops/snaps-distance';
import { InstallMain, InstallAspect } from '@teambit/install';
import { MergeCmd } from './merge-cmd';
import { MergingAspect } from './merging.aspect';
import { ConfigMerger } from './config-merger';
import { ConfigMergeResult } from './config-merge-result';

type ResolveUnrelatedData = { strategy: MergeStrategy; head: Ref };
type PkgEntry = { name: string; version: string; force: boolean };

export type WorkspaceDepsUpdates = { [pkgName: string]: [string, string] }; // from => to
export type WorkspaceDepsConflicts = Record<WorkspacePolicyConfigKeysNames, Array<{ name: string; version: string }>>; // the pkg value is in a format of CONFLICT::OURS::THEIRS

export type ComponentMergeStatus = {
  currentComponent?: ConsumerComponent | null;
  componentFromModel?: Version;
  id: BitId;
  unmergedMessage?: string;
  unmergedLegitimately?: boolean; // failed to merge but for a legitimate reason, such as, up-to-date
  mergeResults?: MergeResultsThreeWay | null;
  divergeData?: SnapsDistance;
  resolvedUnrelated?: ResolveUnrelatedData;
  configMergeResult?: ConfigMergeResult;
  shouldBeRemoved?: boolean; // in case the component is soft-removed, it should be removed from the workspace
};

export type ComponentMergeStatusBeforeMergeAttempt = {
  currentComponent?: ConsumerComponent | null;
  componentFromModel?: Version;
  id: BitId;
  unmergedMessage?: string;
  unmergedLegitimately?: boolean; // failed to merge but for a legitimate reason, such as, up-to-date
  divergeData?: SnapsDistance;
  resolvedUnrelated?: ResolveUnrelatedData;
  shouldBeRemoved?: boolean; // in case the component is soft-removed, it should be removed from the workspace
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
  resolvedComponents?: ConsumerComponent[]; // relevant for bit merge --resolve
  abortedComponents?: ApplyVersionResult[]; // relevant for bit merge --abort
  mergeSnapResults?: { snappedComponents: ConsumerComponent[]; autoSnappedResults: AutoTagResult[] } | null;
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
  private consumer: Consumer;
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
  ) {
    this.consumer = this.workspace?.consumer;
  }

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

    if (componentIdsToRemove.length) {
      await this.remove.removeLocallyByIds(componentIdsToRemove, { force: true });
    }

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
        const { taggedComponents, autoTaggedResults } = results;
        return { snappedComponents: taggedComponents, autoSnappedResults: autoTaggedResults };
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
      components: componentsResults,
      failedComponents,
      removedComponents: componentIdsToRemove,
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
    if (!currentLane && otherLane) {
      await this.importer.importObjectsFromMainIfExist(otherLane.toBitIds().toVersionLatest());
    }
    const componentStatusBeforeMergeAttempt = await mapSeries(bitIds, (id) =>
      this.getComponentStatusBeforeMergeAttempt(id, currentLane, options)
    );
    const toImport = componentStatusBeforeMergeAttempt
      .map((compStatus) => {
        if (!compStatus.divergeData) return [];
        const versionsToImport = compact([
          ...compStatus.divergeData.snapsOnTargetOnly,
          compStatus.divergeData.commonSnapBeforeDiverge,
        ]);
        return versionsToImport.map((v) => compStatus.id.changeVersion(v.toString()));
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

    const getComponentsStatusNeedMerge = async (): Promise<ComponentMergeStatus[]> => {
      const tmp = new Tmp(this.consumer.scope);
      try {
        const componentsStatus = await Promise.all(
          compStatusNeedMerge.map((compStatus) =>
            this.getComponentMergeStatus(currentLane, otherLane || undefined, compStatus)
          )
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
    const componentOnOther: Version = await modelComponent.loadVersion(version, consumer.scope.objects);
    if (componentOnOther.isRemoved()) {
      if (existingBitMapId) componentStatus.shouldBeRemoved = true;
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
      return { currentComponent: null, componentFromModel: componentOnOther, id, divergeData };
    }
    const getCurrentComponent = () => {
      if (existingBitMapId) return consumer.loadComponent(existingBitMapId);
      return consumer.scope.getConsumerComponent(currentId);
    };
    const currentComponent = await getCurrentComponent();
    if (currentComponent.removed) {
      return returnUnmerged(`component has been removed`, true);
    }
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
            componentFromModel: componentOnOther,
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
          componentFromModel: componentOnOther,
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
    otherLane: Lane | undefined, // the lane name we want to merged to our lane. (can be also "main").
    componentMergeStatusBeforeMergeAttempt: ComponentMergeStatusBeforeMergeAttempt
  ) {
    const { id, divergeData, currentComponent, mergeProps } = componentMergeStatusBeforeMergeAttempt;
    if (!mergeProps) throw new Error(`getDivergedMergeStatus, mergeProps is missing for ${id.toString()}`);
    const { otherLaneHead, currentId, modelComponent } = mergeProps;
    const repo = this.consumer.scope.objects;
    if (!divergeData) throw new Error(`getDivergedMergeStatus, divergeData is missing for ${id.toString()}`);
    if (!currentComponent) throw new Error(`getDivergedMergeStatus, currentComponent is missing for ${id.toString()}`);

    const baseSnap = divergeData.commonSnapBeforeDiverge as Ref; // must be set when isTrueMerge
    this.logger.debug(`merging snaps details:
id:      ${id.toStringWithoutVersion()}
base:    ${baseSnap.toString()}
current: ${currentId.version}
other:   ${otherLaneHead.toString()}`);
    const baseComponent: Version = await modelComponent.loadVersion(baseSnap.toString(), repo);
    const otherComponent: Version = await modelComponent.loadVersion(otherLaneHead.toString(), repo);

    const currentLaneName = localLane?.toLaneId().toString() || 'main';
    const otherLaneName = otherLane ? otherLane.toLaneId().toString() : DEFAULT_LANE;
    const currentLabel = `${currentId.version} (${currentLaneName === otherLaneName ? 'current' : currentLaneName})`;
    const otherLabel = `${otherLaneHead.toString()} (${
      otherLaneName === currentLaneName ? 'incoming' : otherLaneName
    })`;
    const workspaceIds = await this.workspace.listIds();
    const configMerger = new ConfigMerger(
      id.toStringWithoutVersion(),
      workspaceIds,
      otherLane,
      currentComponent.extensions,
      baseComponent.extensions,
      otherComponent.extensions,
      currentLabel,
      otherLabel,
      this.logger
    );
    const configMergeResult = configMerger.merge();

    const mergeResults = await threeWayMerge({
      consumer: this.consumer,
      otherComponent,
      otherLabel,
      currentComponent,
      currentLabel,
      baseComponent,
    });
    return { currentComponent, id, mergeResults, divergeData, configMergeResult };
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
      unmergedComponent.laneId = localLane.toLaneId();
      unmergedComponent.head = resolvedUnrelated.head;
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
