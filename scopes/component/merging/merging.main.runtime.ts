import type { CLIMain } from '@teambit/cli';
import { MainRuntime } from '@teambit/harmony.modules.runtimes';
import { CLIAspect } from '@teambit/cli';
import type { Workspace } from '@teambit/workspace';
import { WorkspaceAspect, OutsideWorkspaceError } from '@teambit/workspace';
import type { Consumer } from '@teambit/legacy.consumer';
import { ComponentsList } from '@teambit/legacy.component-list';
import type { SnappingMain, TagResults } from '@teambit/snapping';
import { SnappingAspect } from '@teambit/snapping';
import mapSeries from 'p-map-series';
import { ComponentID, ComponentIdList } from '@teambit/component-id';
import { BitError } from '@teambit/bit-error';
import { LaneId } from '@teambit/lane-id';
import type { UnmergedComponent } from '@teambit/legacy.scope';
import {
  withRustMergeTransactionOperation,
  retireRustMergeTransaction,
  withRustMergeTransactionJournal,
  completeRustMergeTransactionPhase,
  canUseRustMergeTransactionMode,
  hasRustSnapshotFunctions,
  hasRustSnapshotTransactionClassFields,
  registerRustSnapshotTransactionClass,
  type Ref,
  type Version,
  type Lane,
  type ModelComponent,
} from '@teambit/objects';
import { applyRetainedRustMerge } from './rust-merge-retained-apply';
import {
  rustMergeApplyCount,
  rustMergeResultIds,
  tryRustMergeApplyDecision,
  tryRustMergeLaneBucket,
  tryRustMergeResultsSelection,
} from './rust-merge-apply';
import chalk from 'chalk';
import type { ConfigMain } from '@teambit/config';
import { ConfigAspect } from '@teambit/config';
import type { RemoveMain } from '@teambit/remove';
import { RemoveAspect, deleteComponentsFiles } from '@teambit/remove';
import { pathNormalizeToLinux } from '@teambit/toolbox.path.path';
import { componentIdToPackageName } from '@teambit/pkg.modules.component-package-name';
import type { ComponentWriterMain } from '@teambit/component-writer';
import { ComponentWriterAspect } from '@teambit/component-writer';
import type { ConsumerComponent } from '@teambit/legacy.consumer-component';
import type { ImporterMain } from '@teambit/importer';
import { ImporterAspect } from '@teambit/importer';
import type { Logger, LoggerMain } from '@teambit/logger';
import { LoggerAspect } from '@teambit/logger';
import { compact } from 'lodash';
import type { ApplyVersionWithComps, CheckoutMain, ComponentStatusBase } from '@teambit/checkout';
import { CheckoutAspect, removeFilesIfNeeded, updateFileStatusWithRust } from '@teambit/checkout';
import type { ConfigMergerMain, ConfigMergeResult, PolicyDependency } from '@teambit/config-merger';
import { ConfigMergerAspect, registerRustScopePolicy, tryRustScopePolicy } from '@teambit/config-merger';
import type { SnapsDistance } from '@teambit/component.snap-distance';
import type { DependencyResolverMain } from '@teambit/dependency-resolver';
import { DependencyResolverAspect } from '@teambit/dependency-resolver';
import type { InstallMain } from '@teambit/install';
import { InstallAspect } from '@teambit/install';
import type { ScopeMain } from '@teambit/scope';
import { ScopeAspect } from '@teambit/scope';
import type { ExtensionDataList } from '@teambit/legacy.extension-data';
import { MergeCmd } from './merge-cmd';
import { MergingAspect } from './merging.aspect';
import type { DataMergeResult, MergeStatusProviderOptions } from './merge-status-provider';
import { MergeStatusProvider } from './merge-status-provider';
import type {
  MergeStrategy,
  MergeResultsThreeWay,
  ApplyVersionResults,
  FailedComponents,
  MergeSnapResults,
} from '@teambit/component.modules.merge-helper';
import {
  applyModifiedVersion,
  applyModifiedVersionWithPlan,
  hasRustCheckoutApplyFunctions,
  hasRustMergeRetainedBodyFunctions,
  getRustMergeResultBodyPlan,
  captureNativeMergeTarget,
  FileStatus,
  getMergeStrategyInteractive,
  MergeOptions,
} from '@teambit/component.modules.merge-helper';
import type { ConfigStoreMain } from '@teambit/config-store';
import { ConfigStoreAspect } from '@teambit/config-store';
import type { ApplicationMain } from '@teambit/application';
import { ApplicationAspect } from '@teambit/application';

type ResolveUnrelatedData = {
  strategy: MergeStrategy;
  headOnCurrentLane: Ref;
  unrelatedHead: Ref;
  unrelatedLaneId: LaneId;
};

export type DivergedComponent = { id: ComponentID; diverge: SnapsDistance };

export type ComponentMergeStatus = ComponentStatusBase & {
  mergeResults?: MergeResultsThreeWay | null;
  divergeData?: SnapsDistance;
  resolvedUnrelated?: ResolveUnrelatedData;
  configMergeResult?: ConfigMergeResult;
  dataMergeResult?: DataMergeResult;
};

export type ComponentMergeStatusBeforeMergeAttempt = ComponentStatusBase & {
  divergeData?: SnapsDistance;
  resolvedUnrelated?: ResolveUnrelatedData;
  mergeProps?: {
    otherLaneHead: Ref;
    currentId: ComponentID;
    modelComponent: ModelComponent;
  };
};

export class MergingMain {
  constructor(
    private workspace: Workspace,
    private scope: ScopeMain,
    private install: InstallMain,
    private snapping: SnappingMain,
    private checkout: CheckoutMain,
    private logger: Logger,
    private componentWriter: ComponentWriterMain,
    private importer: ImporterMain,
    private config: ConfigMain,
    private remove: RemoveMain,
    private configMerger: ConfigMergerMain,
    private depResolver: DependencyResolverMain,
    private application: ApplicationMain
  ) {}

  async merge(
    pattern: string,
    mergeStrategy: MergeStrategy,
    abort: boolean,
    resolve: boolean,
    noAutoSnap: boolean,
    message: string,
    build: boolean,
    skipDependencyInstallation: boolean
  ): Promise<ApplyVersionResults> {
    return withRustMergeTransactionOperation(async () => {
      if (!this.workspace) throw new OutsideWorkspaceError();
      const consumer: Consumer = this.workspace.consumer;
      let mergeResults;
      if (resolve) {
        mergeResults = await this.resolveMerge(pattern, message, build);
      } else if (abort) {
        mergeResults = await this.abortMerge(pattern, skipDependencyInstallation);
      } else {
        const bitIds = await this.getComponentsToMerge(pattern);
        mergeResults = await this.mergeComponentsFromRemote(
          consumer,
          bitIds,
          mergeStrategy,
          noAutoSnap,
          message,
          build,
          skipDependencyInstallation
        );
      }
      await consumer.onDestroy('merge');
      return mergeResults;
    });
  }

  /**
   * when user is on main, it merges the remote main components into local.
   * when user is on a lane, it merges the remote lane components into the local lane.
   */
  async mergeComponentsFromRemote(
    consumer: Consumer,
    bitIds: ComponentID[],
    mergeStrategy: MergeStrategy,
    noAutoSnap: boolean,
    snapMessage: string,
    build: boolean,
    skipDependencyInstallation: boolean
  ): Promise<ApplyVersionResults> {
    return withRustMergeTransactionOperation(async () => {
      const currentLaneId = consumer.getCurrentLaneId();
      const currentLaneObject = await consumer.getCurrentLaneObject();
      const allComponentsStatus = await this.getAllComponentsStatus(
        bitIds,
        currentLaneId,
        currentLaneObject,
        mergeStrategy
      );
      const failedComponents = allComponentsStatus.filter((c) => c.unchangedMessage && !c.unchangedLegitimately);
      if (failedComponents.length) {
        const failureMsgs = failedComponents
          .map(
            (failedComponent) =>
              `${chalk.bold(failedComponent.id.toString())} - ${chalk.red(failedComponent.unchangedMessage as string)}`
          )
          .join('\n');
        throw new BitError(`unable to merge due to the following failures:\n${failureMsgs}`);
      }

      return this.mergeSnaps({
        mergeStrategy,
        allComponentsStatus,
        otherLaneId: currentLaneId,
        currentLane: currentLaneObject,
        noAutoSnap: noAutoSnap,
        snapMessage,
        build,
        skipDependencyInstallation,
      });
    });
  }

  /**
   * merge multiple components according to the "allComponentsStatus".
   */
  async mergeSnaps({
    mergeStrategy,
    allComponentsStatus,
    otherLaneId,
    currentLane,
    noAutoSnap,
    noSnap,
    tag,
    snapMessage,
    build,
    skipDependencyInstallation,
    detachHead,
    loose,
    shouldSquash,
  }: {
    mergeStrategy: MergeStrategy;
    allComponentsStatus: ComponentMergeStatus[];
    otherLaneId: LaneId;
    currentLane?: Lane;
    noAutoSnap?: boolean;
    noSnap?: boolean;
    tag?: boolean;
    snapMessage?: string;
    build?: boolean;
    skipDependencyInstallation?: boolean;
    detachHead?: boolean;
    loose?: boolean;
    shouldSquash?: boolean;
  }): Promise<ApplyVersionResults> {
    return withRustMergeTransactionOperation(async () => {
      const count = rustMergeApplyCount(this, allComponentsStatus);
      // Receipts follow the canonical effect sequence; keep its callback and error boundaries visible.
      // eslint-disable-next-line complexity
      const merge = async () => {
        const nativeApply = count !== undefined && canUseRustMergeTransactionMode('apply');
        const consumer = this.workspace?.consumer;
        const legacyScope = this.scope.legacyScope;
        const componentWithConflict = allComponentsStatus.find(
          (component) => component.mergeResults && component.mergeResults.hasConflicts
        );
        if (componentWithConflict && !mergeStrategy) {
          // A prompt may end on stdin EOF without settling its promise. Release the
          // private child before handing control to the canonical interactive adapter.
          await retireRustMergeTransaction();
          mergeStrategy = await getMergeStrategyInteractive();
        }
        if (nativeApply && canUseRustMergeTransactionMode('apply')) await completeRustMergeTransactionPhase('prompt');
        const nativeSelection = nativeApply ? await tryRustMergeResultsSelection(this, allComponentsStatus) : undefined;
        const failedStatuses = nativeSelection
          ? nativeSelection.failed.map((index) => allComponentsStatus[index])
          : allComponentsStatus
              .filter((componentStatus) => componentStatus.unchangedMessage)
              .filter((componentStatus) => !componentStatus.shouldBeRemoved);
        const failedComponents: FailedComponents[] = failedStatuses.map((componentStatus) => ({
          id: componentStatus.id,
          unchangedMessage: componentStatus.unchangedMessage as string,
          unchangedLegitimately: componentStatus.unchangedLegitimately,
        }));

        const componentIdsToRemove = (
          nativeSelection
            ? nativeSelection.remove.map((index) => allComponentsStatus[index])
            : allComponentsStatus.filter((componentStatus) => componentStatus.shouldBeRemoved)
        ).map((c) => c.id.changeVersion(undefined));

        const succeededComponents = nativeSelection
          ? nativeSelection.succeeded.map((index) => allComponentsStatus[index])
          : allComponentsStatus.filter((componentStatus) => !componentStatus.unchangedMessage);
        if (nativeApply && canUseRustMergeTransactionMode('apply'))
          await completeRustMergeTransactionPhase('results', undefined, succeededComponents.length);

        const currentLaneIdsBeforeMerge = currentLane?.toComponentIds();

        const componentsResults = await this.applyVersionMultiple(
          succeededComponents,
          otherLaneId,
          mergeStrategy,
          currentLane,
          detachHead,
          shouldSquash,
          nativeApply
        );

        const allConfigMerge = compact(succeededComponents.map((c) => c.configMergeResult));

        const { workspaceDepsUpdates, workspaceDepsConflicts, workspaceDepsUnchanged } = this.workspace
          ? await this.configMerger.updateWorkspaceJsoncWithDepsIfNeeded(allConfigMerge)
          : { workspaceDepsUpdates: undefined, workspaceDepsConflicts: undefined, workspaceDepsUnchanged: undefined };

        if (nativeApply && canUseRustMergeTransactionMode('apply'))
          await completeRustMergeTransactionPhase('workspaceConfig');
        let workspaceConfigConflictWriteError: Error | undefined;
        if (workspaceDepsConflicts) {
          workspaceConfigConflictWriteError =
            await this.configMerger.writeWorkspaceJsoncWithConflictsGracefully(workspaceDepsConflicts);
        }
        if (nativeApply && canUseRustMergeTransactionMode('apply'))
          await completeRustMergeTransactionPhase('configConflict');
        if (this.workspace) await this.configMerger.generateConfigMergeConflictFileForAll(allConfigMerge);
        if (nativeApply && canUseRustMergeTransactionMode('apply'))
          await completeRustMergeTransactionPhase('configFiles');

        if (currentLane) {
          const laneHistoryMsg = `merge from "${otherLaneId.toString()}"`;
          const laneHistory = await legacyScope.lanes.updateLaneHistory(currentLane, laneHistoryMsg);
          legacyScope.objects.add(laneHistory);
          legacyScope.objects.add(currentLane);
        }

        if (nativeApply && canUseRustMergeTransactionMode('apply'))
          await completeRustMergeTransactionPhase('laneHistory');
        await legacyScope.objects.persist(); // persist anyway, if currentLane is null it should save all main heads

        if (nativeApply && canUseRustMergeTransactionMode('apply')) await completeRustMergeTransactionPhase('persist');
        await legacyScope.objects.unmergedComponents.write();
        if (nativeApply && canUseRustMergeTransactionMode('apply'))
          await completeRustMergeTransactionPhase('pendingWrite');

        if (this.workspace) {
          await consumer.writeBitMap(`merge ${otherLaneId.toString()}`);
          if (nativeApply && canUseRustMergeTransactionMode('apply')) await completeRustMergeTransactionPhase('bitmap');
          await this.removeFromWsJsonPolicyIfExists(componentsResults, currentLane, currentLaneIdsBeforeMerge);
        }

        if (nativeApply && canUseRustMergeTransactionMode('apply')) {
          if (!this.workspace) await completeRustMergeTransactionPhase('bitmap');
          await completeRustMergeTransactionPhase('workspacePolicy');
        }
        if (componentIdsToRemove.length && this.workspace) {
          const compBitIdsToRemove = ComponentIdList.fromArray(componentIdsToRemove);
          await deleteComponentsFiles(consumer, compBitIdsToRemove);
          await consumer.cleanFromBitMap(compBitIdsToRemove);
        }

        if (nativeApply && canUseRustMergeTransactionMode('apply'))
          await completeRustMergeTransactionPhase('componentRemove');
        const componentsHasConfigMergeConflicts = allComponentsStatus.some((c) => c.configMergeResult?.hasConflicts());
        const leftUnresolvedConflicts = componentWithConflict && mergeStrategy === 'manual';

        if (nativeApply && canUseRustMergeTransactionMode('apply'))
          await completeRustMergeTransactionPhase('conflicts');
        if (!skipDependencyInstallation && !leftUnresolvedConflicts && !componentsHasConfigMergeConflicts) {
          // the merged components were loaded (and cached) before the merge wrote their merged files
          // and merged config (unmerged-components store). without clearing their cache, the install
          // below reloads them with pre-merge dependencies, so a package newly introduced on the other
          // side never enters the install manifest and the package manager skips it ("lockfile is up to
          // date"). clear only the merged components (the caches are version-keyed, so pass the current
          // workspace version — the one the pre-merge loads were cached under, and the one the install
          // reloads since .bitmap still points to it until the snap); the rest of the workspace and the
          // scope cache are untouched to keep the merge fast.
          if (this.workspace) {
            const idsToClearCache = succeededComponents.flatMap((c) => compact([c.currentComponent?.id, c.id]));
            this.workspace.clearComponentsCache(idsToClearCache);
          }
          // this is a workaround.
          // keep this here. although it gets called before snapping.
          // the reason is that when the installation is running, for some reason, some apps are unable to load in the same process.
          // they throw an error "Cannot find module" during the aspect loading.
          await this.application.loadAllAppsAsAspects();

          try {
            await this.install.install(undefined, {
              dedupe: true,
              updateExisting: false,
              import: false,
            });
          } catch (err: any) {
            this.logger.error(`failed installing packages`, err);
            this.logger.consoleFailure(
              `failed installing packages, see the log for full stacktrace. error: ${err.message}`
            );
          }
        }

        if (nativeApply && canUseRustMergeTransactionMode('apply')) await completeRustMergeTransactionPhase('install');
        const updatedComponents = compact(componentsResults.map((c) => c.legacyCompToWrite));

        if (nativeApply && canUseRustMergeTransactionMode('apply'))
          await completeRustMergeTransactionPhase('updatedComponents');
        const getSnapOrTagResults = async (): Promise<MergeSnapResults> => {
          // if one of the component has conflict, don't snap-merge. otherwise, some of the components would be snap-merged
          // and some not. besides the fact that it could by mistake tag dependent, it's a confusing state. better not snap.
          if (noAutoSnap || noSnap || leftUnresolvedConflicts || componentsHasConfigMergeConflicts) {
            return null;
          }
          if (tag) {
            const idsToTag = allComponentsStatus.map((c) => c.id);
            const results = await this.tagAllLaneComponent(idsToTag, snapMessage, build);
            if (!results) return null;
            const { taggedComponents, autoTaggedResults, removedComponents } = results;
            return { snappedComponents: taggedComponents, autoSnappedResults: autoTaggedResults, removedComponents };
          }
          return this.snapResolvedComponents(allComponentsStatus, updatedComponents, {
            snapMessage,
            build,
            laneId: currentLane?.toLaneId(),
            loose,
          });
        };
        let mergeSnapResults: MergeSnapResults = null;
        let mergeSnapError: Error | undefined;
        const bitMapSnapshot = this.workspace ? this.workspace.bitMap.takeSnapshot() : null;
        if (nativeApply && canUseRustMergeTransactionMode('apply'))
          await completeRustMergeTransactionPhase('bitmapSnapBeforeAutoSnap');
        try {
          mergeSnapResults = await getSnapOrTagResults();
        } catch (err: any) {
          this.logger.error('failed running snap. mergeSnapError:', err);
          mergeSnapError = err;
          if (bitMapSnapshot) this.workspace.bitMap.restoreFromSnapshot(bitMapSnapshot);
        }

        if (nativeApply && canUseRustMergeTransactionMode('apply')) await completeRustMergeTransactionPhase('snap');
        const report = {
          components: componentsResults.map((c) => c.applyVersionResult),
          failedComponents,
          removedComponents: [...componentIdsToRemove, ...(mergeSnapResults?.removedComponents || [])],
          mergeSnapResults,
          mergeSnapError,
          workspaceConfigUpdateResult: {
            workspaceDepsUpdates,
            workspaceDepsConflicts,
            workspaceDepsUnchanged,
            workspaceConfigConflictWriteError,
          },
          leftUnresolvedConflicts,
        };
        if (nativeApply && canUseRustMergeTransactionMode('apply')) await completeRustMergeTransactionPhase('report');
        return report;
      };
      return count === undefined ? merge() : withRustMergeTransactionJournal({ mode: 'apply', count }, merge);
    });
  }

  async removeFromWsJsonPolicyIfExists(
    componentsResults: ApplyVersionWithComps[],
    currentLane?: Lane,
    currentLaneIdsBeforeMerge?: ComponentIdList
  ) {
    const newlyIntroducedIds = currentLane
      ?.toComponentIds()
      .filter((id) => !currentLaneIdsBeforeMerge?.hasWithoutVersion(id));
    const newlyIntroducedComponentIds = ComponentIdList.fromArray(newlyIntroducedIds || []);
    const components = compact(
      componentsResults
        .map((c) => c.legacyCompToWrite)
        .filter((c) => c && newlyIntroducedComponentIds.hasWithoutVersion(c.id))
    );
    const packages = components.map((c) => componentIdToPackageName(c));
    const isRemoved = this.depResolver.removeFromRootPolicy(packages);
    if (isRemoved) await this.depResolver.persistConfig('merge (remove packages)');
  }

  /**
   * this function gets called from two different commands:
   * 1. "bit merge <ids...>", when merging a component from a remote to the local.
   * in this case, the remote and local are on the same lane or both on main.
   * 2. "bit lane merge", when merging from one lane to another.
   */
  async getMergeStatus(
    bitIds: ComponentID[], // the id.version is the version we want to merge to the current component
    options: MergeStatusProviderOptions,
    currentLane?: Lane, // currently checked out lane. if on main, then it's null.
    otherLane?: Lane // the lane we want to merged to our lane. (null if it's "main").
  ): Promise<ComponentMergeStatus[]> {
    return withRustMergeTransactionOperation(async () => {
      const mergeStatusProvider = new MergeStatusProvider(
        this.scope,
        this.logger,
        this.importer,
        options,
        this.workspace,
        currentLane,
        otherLane
      );
      return mergeStatusProvider.getStatus(bitIds);
    });
  }

  private async applyVersionMultiple(
    succeededComponents: ComponentMergeStatus[],
    otherLaneId: LaneId,
    mergeStrategy: MergeStrategy,
    currentLane?: Lane,
    detachHead?: boolean,
    shouldSquash?: boolean,
    nativeApply = false
  ): Promise<ApplyVersionWithComps[]> {
    let nativeApplyIndex = 0;
    const componentsResults = await mapSeries(
      succeededComponents,
      async ({ currentComponent, id, mergeResults, resolvedUnrelated, configMergeResult }) => {
        const modelComponent = await this.scope.legacyScope.getModelComponent(id);
        const updatedLaneId = otherLaneId.isDefault() ? LaneId.from(otherLaneId.name, id.scope as string) : otherLaneId;
        const result = await this.applyVersion({
          currentComponent,
          id,
          mergeResults,
          mergeStrategy,
          remoteHead: modelComponent.getRef(id.version as string) as Ref,
          otherLaneId: updatedLaneId,
          currentLane,
          resolvedUnrelated,
          configMergeResult,
          detachHead,
          shouldSquash,
          nativeApplyIndex: nativeApply && canUseRustMergeTransactionMode('apply') ? nativeApplyIndex : undefined,
        });
        if (nativeApply && canUseRustMergeTransactionMode('apply')) await completeRustMergeTransactionPhase('apply', 1);
        nativeApplyIndex++;
        return result;
      }
    );
    if (nativeApply && canUseRustMergeTransactionMode('apply') && !succeededComponents.length)
      await completeRustMergeTransactionPhase('apply', 0);

    if (this.workspace) {
      // Hidden lane updateDependents live only on the lane and in the scope. Writing them to
      // the workspace would (a) leak internal lane plumbing into bitmap/files, and (b) confuse
      // downstream classifiers that key off bitmap-presence (the cascade-on-snap detector in
      // version-maker treats "in bitmap" as "workspace tracked"). Filter them out here.
      const hiddenIds = currentLane?.updateDependents || [];
      const nativeResultIds =
        nativeApply && canUseRustMergeTransactionMode('apply') ? rustMergeResultIds(componentsResults) : undefined;
      const nativeVisibility = nativeResultIds
        ? await tryRustMergeResultsSelection(this, succeededComponents, hiddenIds, nativeResultIds)
        : undefined;
      const visibleResults = nativeVisibility
        ? nativeVisibility.visible.map((index) => componentsResults[index])
        : componentsResults.filter((c) => !hiddenIds.find((id) => id.isEqualWithoutVersion(c.applyVersionResult.id)));
      const compsToWrite = compact(visibleResults.map((c) => c.legacyCompToWrite));
      const manyComponentsWriterOpts = {
        consumer: this.workspace.consumer,
        components: compsToWrite,
        skipDependencyInstallation: true,
        writeConfig: false, // @todo: should write if config exists before, needs to figure out how to do it.
        reasonForBitmapChange: 'merge',
      };
      await this.componentWriter.writeMany(manyComponentsWriterOpts);
    }

    if (nativeApply && canUseRustMergeTransactionMode('apply')) await completeRustMergeTransactionPhase('writeMany');
    return componentsResults;
  }

  // Preserve the canonical per-component callback and mutation order across native decisions.
  // eslint-disable-next-line complexity
  private async applyVersion({
    currentComponent,
    id,
    mergeResults,
    mergeStrategy,
    remoteHead,
    otherLaneId,
    currentLane,
    resolvedUnrelated,
    configMergeResult,
    detachHead,
    shouldSquash,
    nativeApplyIndex,
  }: {
    nativeApplyIndex?: number;
    currentComponent: ConsumerComponent | null | undefined;
    id: ComponentID;
    mergeResults: MergeResultsThreeWay | null | undefined;
    mergeStrategy: MergeStrategy;
    remoteHead: Ref;
    otherLaneId: LaneId;
    currentLane?: Lane;
    resolvedUnrelated?: ResolveUnrelatedData;
    configMergeResult?: ConfigMergeResult;
    detachHead?: boolean;
    shouldSquash?: boolean;
  }): Promise<ApplyVersionWithComps> {
    const legacyScope = this.scope.legacyScope;
    let filesStatus = {};
    const unmergedComponent: UnmergedComponent = {
      id: { name: id.fullName, scope: id.scope },
      head: remoteHead,
      laneId: otherLaneId,
      // diverged components get squashed at snap-creation time (single-parent + squashed metadata)
      // when shouldSquash is set. fast-forward squash is handled separately by squashSnaps().
      shouldSquash: Boolean(shouldSquash && mergeResults),
    };
    id = currentComponent ? currentComponent.id : id;
    const modelComponent = await legacyScope.getModelComponent(id);

    const nativeDecision =
      nativeApplyIndex === undefined
        ? undefined
        : await tryRustMergeApplyDecision(this, nativeApplyIndex, {
            currentComponent,
            mergeResults,
            resolvedUnrelated,
            mergeStrategy,
            currentLane,
            detachHead,
            shouldSquash,
          });
    if (nativeDecision) unmergedComponent.shouldSquash = nativeDecision.shouldSquash;

    const addToCurrentLane = (head: Ref): void | Promise<void> => {
      if (!currentLane) throw new Error('currentLane must be defined when adding to the lane');
      const existingOnLane = currentLane.getComponent(id);
      const existingInUpdateDependents = currentLane.findUpdateDependent(id);
      const otherIsMain = otherLaneId.isDefault();
      const applyBucket = (bucket: 'skip' | 'hidden' | 'visible') => {
        if (bucket === 'skip') return;
        if (bucket === 'hidden') {
          currentLane.addComponentToUpdateDependents(id.changeVersion(head.toString()));
        } else {
          currentLane.addComponent({ id, head });
        }
      };
      const canonicalBucket = () =>
        otherIsMain && !existingOnLane && !existingInUpdateDependents
          ? ('skip' as const)
          : existingInUpdateDependents && !existingOnLane
            ? ('hidden' as const)
            : ('visible' as const);
      if (nativeApplyIndex === undefined || !canUseRustMergeTransactionMode('apply')) {
        applyBucket(canonicalBucket());
        return;
      }
      return tryRustMergeLaneBucket(this, nativeApplyIndex, {
        otherIsMain,
        currentOnLane: Boolean(existingOnLane),
        currentHidden: Boolean(existingInUpdateDependents),
      }).then((bucket) => applyBucket(bucket || canonicalBucket()));
    };

    const convertHashToTagIfPossible = (componentId: ComponentID): ComponentID => {
      if (!componentId.version) return componentId;
      const tag = modelComponent.getTag(componentId.version);
      return tag ? componentId.changeVersion(tag) : componentId;
    };

    const handleResolveUnrelated = async (legacyCompToWrite?: ConsumerComponent) => {
      if (!currentComponent) throw new Error('currentComponent must be defined when resolvedUnrelated');
      // because when on a main, we don't allow merging lanes with unrelated. we asks users to switch to the lane
      // first and then merge with --resolve-unrelated
      if (!currentLane) throw new Error('currentLane must be defined when resolvedUnrelated');
      if (!resolvedUnrelated) throw new Error('resolvedUnrelated must be populated');
      const laneUpdate = addToCurrentLane(resolvedUnrelated.headOnCurrentLane);
      if (laneUpdate) await laneUpdate;
      unmergedComponent.unrelated = {
        unrelatedHead: resolvedUnrelated.unrelatedHead,
        headOnCurrentLane: resolvedUnrelated.headOnCurrentLane,
        unrelatedLaneId: resolvedUnrelated.unrelatedLaneId,
      };
      if (process.env.BIT_RUST_CLIENT_VCS === 'on')
        await legacyScope.objects.unmergedComponents.addEntryNative(unmergedComponent);
      else legacyScope.objects.unmergedComponents.addEntry(unmergedComponent);
      const idForOutput = convertHashToTagIfPossible(id);
      return { applyVersionResult: { id: idForOutput, filesStatus }, component: currentComponent, legacyCompToWrite };
    };

    const markAllFilesAsUnchanged = () => {
      if (!currentComponent) throw new Error(`applyVersion expect to get currentComponent for ${id.toString()}`);
      currentComponent.files.forEach((file) => {
        filesStatus[pathNormalizeToLinux(file.relative)] = FileStatus.unchanged;
      });
    };
    if (
      nativeDecision
        ? nativeDecision.action === 'oursConflict'
        : mergeResults && mergeResults.hasConflicts && mergeStrategy === MergeOptions.ours
    ) {
      markAllFilesAsUnchanged();
      if (process.env.BIT_RUST_CLIENT_VCS === 'on')
        await legacyScope.objects.unmergedComponents.addEntryNative(unmergedComponent);
      else legacyScope.objects.unmergedComponents.addEntry(unmergedComponent);
      const idForOutput = convertHashToTagIfPossible(id);
      return { applyVersionResult: { id: idForOutput, filesStatus }, component: currentComponent || undefined };
    }
    if (nativeDecision ? nativeDecision.action === 'unrelatedOurs' : resolvedUnrelated?.strategy === 'ours') {
      markAllFilesAsUnchanged();
      return handleResolveUnrelated();
    }
    const remoteId = id.changeVersion(remoteHead.toString());
    const idToLoad = nativeDecision
      ? nativeDecision.load === 'remote'
        ? remoteId
        : id
      : !mergeResults || mergeStrategy === MergeOptions.theirs
        ? remoteId
        : id;
    const bodyFunctions = hasRustSnapshotFunctions(['MergeRetainedPublicGuard']) && hasRustMergeRetainedBodyFunctions();
    const retainedPlan = bodyFunctions && mergeResults ? getRustMergeResultBodyPlan(mergeResults) : undefined;
    let actualTarget: ReturnType<typeof captureNativeMergeTarget>;
    const canCaptureTarget =
      retainedPlan &&
      (this.workspace
        ? hasRustSnapshotTransactionClassFields(this.workspace.consumer, 'CheckoutConsumer', ['scope', 'bitMap'])
        : hasRustSnapshotTransactionClassFields(legacyScope, 'MergeLegacyScope', []));
    const targetSourceFiles = canCaptureTarget
      ? (version: Version) => {
          actualTarget = captureNativeMergeTarget(version);
          return undefined;
        }
      : undefined;
    const legacyComponent = this.workspace
      ? targetSourceFiles
        ? await this.workspace.consumer.loadComponentFromModelImportIfNeeded(idToLoad, true, targetSourceFiles)
        : await this.workspace.consumer.loadComponentFromModelImportIfNeeded(idToLoad)
      : targetSourceFiles
        ? await legacyScope.getConsumerComponent(idToLoad, targetSourceFiles)
        : await legacyScope.getConsumerComponent(idToLoad); // when loading from the scope, we import all needed components first, so it should be fine. otherwise, change the code to import it here
    if (nativeDecision ? nativeDecision.keepLocalVersion : mergeResults && mergeStrategy === MergeOptions.theirs) {
      // in this case, we don't want to update .bitmap with the version of the remote. we want to keep the same version
      legacyComponent.version = id.version;
    }
    const files = legacyComponent.files;
    await updateFileStatusWithRust(files, filesStatus, currentComponent || undefined);

    if (mergeResults) {
      // update files according to the merge results
      const target = actualTarget;
      const retained = retainedPlan;
      const nativeApplyFiles =
        target &&
        retained &&
        canUseRustMergeTransactionMode('apply') &&
        hasRustSnapshotFunctions(['MergeRetainedPublicGuard', 'CheckoutPublicApplyGuard']) &&
        hasRustMergeRetainedBodyFunctions() &&
        hasRustCheckoutApplyFunctions();
      const { filesStatus: modifiedStatus, modifiedFiles } = nativeApplyFiles
        ? await applyModifiedVersionWithPlan(files, mergeResults, mergeStrategy, (clones) =>
            applyRetainedRustMerge(clones, mergeResults, retained, target, mergeStrategy)
          )
        : applyModifiedVersion(files, mergeResults, mergeStrategy);
      legacyComponent.files = modifiedFiles;
      filesStatus = { ...filesStatus, ...modifiedStatus };
    }

    if (this.workspace) await removeFilesIfNeeded(filesStatus, this.workspace.consumer, currentComponent || undefined);

    if (configMergeResult) {
      const successfullyMergedConfig = configMergeResult.getSuccessfullyMergedConfig();
      if (successfullyMergedConfig) {
        // Process mergedConfig to merge scope-specific policy and filter deletion markers
        // This happens ONCE here, so both workspace and bare-scope merges use the same processed config
        const nativePolicy =
          process.env.BIT_RUST_CLIENT_VCS === 'on' &&
          (await tryRustScopePolicy(this, legacyComponent.extensions, successfullyMergedConfig));
        if (!nativePolicy) {
          this.mergeScopeSpecificDepsPolicy(legacyComponent.extensions, successfullyMergedConfig);
          this.filterDeletedDependenciesFromConfig(successfullyMergedConfig);
        }

        unmergedComponent.mergedConfig = successfullyMergedConfig;
        // no need to `unmergedComponents.addEntry` here. it'll be added in the next lines inside `if (mergeResults)`.
        // because if `configMergeResult` is set, `mergeResults` must be set as well. both happen on diverge.
      }
    }

    // if mergeResults, the head snap is going to be updated on a later phase when snapping with two parents
    // otherwise, update the head of the current lane or main
    if (mergeResults) {
      if (
        nativeDecision?.isCurrent()
          ? nativeDecision.manualPaths
          : mergeResults.hasConflicts && mergeStrategy === MergeOptions.manual
      ) {
        unmergedComponent.unmergedPaths = mergeResults.modifiedFiles.filter((f) => f.conflict).map((f) => f.filePath);
      }
      if (process.env.BIT_RUST_CLIENT_VCS === 'on')
        await legacyScope.objects.unmergedComponents.addEntryNative(unmergedComponent);
      else legacyScope.objects.unmergedComponents.addEntry(unmergedComponent);
    } else if (currentLane) {
      if (resolvedUnrelated) {
        // must be "theirs"
        return handleResolveUnrelated(legacyComponent);
      }
      const laneUpdate = addToCurrentLane(remoteHead);
      if (laneUpdate) await laneUpdate;
    } else {
      // this is main
      if (nativeDecision ? nativeDecision.headUpdate === 'detached' : detachHead) {
        modelComponent.detachedHeads.setHead(remoteHead);
      } else {
        modelComponent.setHead(remoteHead);
        // mark it as local, otherwise, when importing this component from a remote, it'll override it.
        modelComponent.markVersionAsLocal(remoteHead.toString());
      }
      legacyScope.objects.add(modelComponent);
    }

    const idForOutput = convertHashToTagIfPossible(idToLoad);
    return {
      applyVersionResult: { id: idForOutput, filesStatus },
      component: currentComponent || undefined,
      legacyCompToWrite: legacyComponent,
    };
  }

  private async abortMerge(pattern: string, skipDependencyInstallation: boolean): Promise<ApplyVersionResults> {
    const consumer = this.workspace.consumer;
    const ids = await this.getIdsForUnmerged(pattern);
    const results = await this.checkout.checkout({ ids, reset: true, skipNpmInstall: skipDependencyInstallation });
    if (process.env.BIT_RUST_CLIENT_VCS === 'on')
      await consumer.scope.objects.unmergedComponents.removeComponentsNative(ids);
    else ids.forEach((id) => consumer.scope.objects.unmergedComponents.removeComponent(id));
    await consumer.scope.objects.unmergedComponents.write();
    return { abortedComponents: results.components };
  }

  private async resolveMerge(pattern: string, snapMessage: string, build: boolean): Promise<ApplyVersionResults> {
    const ids = await this.getIdsForUnmerged(pattern);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const { snappedComponents } = await this.snapping.snap({
      legacyBitIds: ComponentIdList.fromArray(ids.map((id) => id)),
      build,
      message: snapMessage,
    });
    return { resolvedComponents: snappedComponents };
  }

  private async getAllComponentsStatus(
    bitIds: ComponentID[],
    laneId: LaneId,
    localLaneObject: Lane | undefined,
    mergeStrategy: MergeStrategy
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

    return this.getMergeStatus(ids, { shouldSquash: false, mergeStrategy }, localLaneObject, localLaneObject);
  }

  private async snapResolvedComponents(
    allComponentsStatus: ComponentMergeStatus[],
    updatedComponents: ConsumerComponent[],
    {
      snapMessage,
      build,
      laneId,
      loose,
    }: {
      snapMessage?: string;
      build?: boolean;
      laneId?: LaneId;
      loose?: boolean;
    }
  ): Promise<MergeSnapResults> {
    const unmergedComponents = this.scope.legacyScope.objects.unmergedComponents.getComponents();
    this.logger.debug(`merge-snaps, snapResolvedComponents, total ${unmergedComponents.length.toString()} components`);
    if (!unmergedComponents.length) return null;
    const ids = ComponentIdList.fromArray(unmergedComponents.map((r) => ComponentID.fromObject(r.id)));
    if (!this.workspace) {
      const getLoadAspectOnlyForIds = (): ComponentIdList | undefined => {
        if (!allComponentsStatus.length || !allComponentsStatus[0].dataMergeResult) return undefined;
        const dataConflictedIds = allComponentsStatus
          .filter((c) => {
            const conflictedAspects = c.dataMergeResult?.conflictedAspects || {};
            const aspectIds = Object.keys(conflictedAspects);
            aspectIds.forEach((aspectId) =>
              this.logger.debug(
                `conflicted-data for "${c.id.toString()}". aspectId: ${aspectId}. reason: ${conflictedAspects[aspectId]}`
              )
            );
            return aspectIds.length;
          })
          .map((c) => c.id);
        return ComponentIdList.fromArray(dataConflictedIds);
      };

      // mergedConfig has already been processed in applyVersion() with scope-specific policy merged
      // and deletion markers filtered, so we can use it directly
      const results = await this.snapping.snapFromScope(
        ids.map((id) => ({
          componentId: id.toString(),
          aspects: this.scope.legacyScope.objects.unmergedComponents.getEntry(id)?.mergedConfig,
        })),
        {
          message: snapMessage,
          build,
          lane: laneId?.toString(),
          updatedLegacyComponents: updatedComponents,
          loadAspectOnlyForIds: getLoadAspectOnlyForIds(),
          loose,
        }
      );
      return results;
    }
    // Hidden lane updateDependents ride the same `makeVersion` batch as visible workspace
    // components. version-maker's `isHiddenLaneEntry` detection (workspace flow: not-in-bitmap)
    // routes each entry correctly. workspace.getMany picks up disk-merged files for visible; the
    // in-memory merged ConsumerComponents from `applyVersion` are passed through for hidden
    // (which have no disk state). Single pipeline → consistent log/buildStatus/
    // flattenedDependencies/lane-history/stagedSnaps for all merge-cascade snaps.
    const lane = await this.scope.legacyScope.getCurrentLaneObject();
    const updateDependentsIds = lane?.updateDependents || [];
    const hiddenIds = ComponentIdList.fromArray(
      ids.filter((id) => updateDependentsIds.find((u) => u.isEqualWithoutVersion(id)))
    );
    const visibleIds = ComponentIdList.fromArray(
      ids.filter((id) => !hiddenIds.find((h) => h.isEqualWithoutVersion(id)))
    );
    const hiddenLegacyComponents = updatedComponents.filter((c) =>
      hiddenIds.find((h) => h.isEqualWithoutVersion(c.componentId))
    );
    return this.snapping.snapForMerge({
      visibleIds,
      hiddenLegacyComponents,
      message: snapMessage,
      build,
      loose,
    });
  }

  private async tagAllLaneComponent(
    idsToTag: ComponentID[],
    tagMessage?: string,
    build?: boolean
  ): Promise<TagResults | null> {
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

  private async getIdsForUnmerged(pattern?: string): Promise<ComponentID[]> {
    if (pattern) {
      const componentIds = await this.workspace.idsByPattern(pattern);
      componentIds.forEach((id) => {
        const entry = this.workspace.consumer.scope.objects.unmergedComponents.getEntry(id);
        if (!entry) {
          throw new BitError(`unable to merge-resolve ${id.toString()}, it is not marked as unresolved`);
        }
      });
      return componentIds;
    }
    const unresolvedComponents = this.workspace.consumer.scope.objects.unmergedComponents.getComponents();
    if (!unresolvedComponents.length) throw new BitError(`all components are resolved already, nothing to do`);
    return unresolvedComponents.map((u) => ComponentID.fromObject(u.id));
  }

  private async getComponentsToMerge(pattern?: string): Promise<ComponentID[]> {
    if (pattern) {
      return this.workspace.idsByPattern(pattern);
    }
    const mergePending = await this.listMergePendingComponents();
    return mergePending.map((c) => c.id);
  }

  async listMergePendingComponents(componentsList?: ComponentsList): Promise<DivergedComponent[]> {
    const consumer = this.workspace.consumer;
    componentsList = componentsList || new ComponentsList(this.workspace);
    const allIds = consumer.bitMap.getAllIdsAvailableOnLaneIncludeRemoved();
    const componentsFromModel = await componentsList.getModelComponents();
    const duringMergeComps = componentsList.listDuringMergeStateComponents();
    const mergePendingComponents = await Promise.all(
      allIds.map(async (componentId: ComponentID) => {
        const modelComponent = componentsFromModel.find((c) => c.toComponentId().isEqualWithoutVersion(componentId));
        if (!modelComponent || duringMergeComps.hasWithoutVersion(componentId)) return null;
        const divergedData = await modelComponent.getDivergeDataForMergePending(consumer.scope.objects);
        if (!divergedData.isDiverged()) return null;
        return { id: modelComponent.toComponentId(), diverge: divergedData };
      })
    );
    return compact(mergePendingComponents);
  }

  /**
   * Merges scope dependency policy into the merged config.
   * This handles dependencies with force:true from the scope, regardless of whether they're
   * set via "bit dependencies set" (__specific: true) or workspace variants.
   *
   * This is needed because if the mergeConfig has a policy, it will be used, and any other policy along the line will be ignored.
   * In case the model has some dependencies that were set explicitly they're gonna be ignored.
   * This makes sure to add them to the policy of the mergeConfig.
   * In a way, this is similar to what we do when a user is running `bit deps set` and the component had previous dependencies set,
   * we copy those dependencies along with the current one to the .bitmap file, so they won't get lost.
   */
  private mergeScopeSpecificDepsPolicy(scopeExtensions: ExtensionDataList, mergeConfig?: Record<string, any>): void {
    const mergeConfigPolicy: Record<string, PolicyDependency[]> | undefined =
      mergeConfig?.[DependencyResolverAspect.id]?.policy;
    if (!mergeConfigPolicy) return;

    const depsResolver = scopeExtensions.findCoreExtension(DependencyResolverAspect.id);
    const scopePolicy = depsResolver?.config.policy;
    if (!scopePolicy) return;

    Object.keys(scopePolicy).forEach((depType) => {
      const scopeDepsForType = scopePolicy[depType];
      if (!mergeConfigPolicy[depType]) {
        // mergeConfigPolicy doesn't have this depType yet.
        // Convert scope policy (object format) to array format before adding
        mergeConfigPolicy[depType] = Object.keys(scopeDepsForType).map((depId) => ({
          name: depId,
          version: scopeDepsForType[depId],
          force: true,
        }));
        return;
      }

      // mergeConfigPolicy is always in array format (from config merger)
      this.addScopePolicyToMergedArray(mergeConfigPolicy[depType], scopeDepsForType);
    });
  }

  private addScopePolicyToMergedArray(policyArray: PolicyDependency[], scopeDepsForType: Record<string, string>): void {
    Object.keys(scopeDepsForType).forEach((depId) => {
      const version = scopeDepsForType[depId];
      const existingDep = policyArray.find((dep) => dep.name === depId);

      if (existingDep) {
        // If merge config has version: '-', it means the dependency was explicitly deleted.
        // Keep the '-' marker and don't override with scope policy.
        if (existingDep.version === '-') {
          return;
        }
        // Otherwise, dependency exists in merge config - keep merge config version (it's stronger)
      } else {
        // Dependency only exists in scope policy - add it to merge config
        policyArray.push({ name: depId, version, force: true });
      }
    });
  }

  private filterDeletedDependenciesFromConfig(mergeConfig?: Record<string, any>): void {
    const policy: Record<string, PolicyDependency[]> | undefined = mergeConfig?.[DependencyResolverAspect.id]?.policy;
    if (!policy) return;

    Object.keys(policy).forEach((depType) => {
      const depValue = policy[depType];
      // Filter out entries with version: '-' (deletion markers)
      const filtered = depValue.filter((dep) => dep.version !== '-');
      // If array is now empty, delete the key to avoid issues with downstream code
      if (filtered.length === 0) {
        delete policy[depType];
      } else {
        policy[depType] = filtered;
      }
    });
  }

  static slots = [];
  static dependencies = [
    CLIAspect,
    WorkspaceAspect,
    ScopeAspect,
    SnappingAspect,
    CheckoutAspect,
    InstallAspect,
    LoggerAspect,
    ComponentWriterAspect,
    ImporterAspect,
    ConfigAspect,
    RemoveAspect,
    ConfigStoreAspect,
    ConfigMergerAspect,
    DependencyResolverAspect,
    ApplicationAspect,
  ];
  static runtime = MainRuntime;
  static async provider([
    cli,
    workspace,
    scope,
    snapping,
    checkout,
    install,
    loggerMain,
    compWriter,
    importer,
    config,
    remove,
    configStore,
    configMerger,
    depResolver,
    application,
  ]: [
    CLIMain,
    Workspace,
    ScopeMain,
    SnappingMain,
    CheckoutMain,
    InstallMain,
    LoggerMain,
    ComponentWriterMain,
    ImporterMain,
    ConfigMain,
    RemoveMain,
    ConfigStoreMain,
    ConfigMergerMain,
    DependencyResolverMain,
    ApplicationMain,
  ]) {
    const logger = loggerMain.createLogger(MergingAspect.id);
    const merging = new MergingMain(
      workspace,
      scope,
      install,
      snapping,
      checkout,
      logger,
      compWriter,
      importer,
      config,
      remove,
      configMerger,
      depResolver,
      application
    );
    cli.register(new MergeCmd(merging, configStore));
    return merging;
  }
}

registerRustScopePolicy(MergingMain);
registerRustSnapshotTransactionClass('MergeMergingMain', MergingMain);
MergingAspect.addRuntime(MergingMain);
