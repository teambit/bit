import { BitError } from '@teambit/bit-error';
import path from 'path';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { ImporterAspect, ImporterMain } from '@teambit/importer';
import { LanesAspect, LanesMain } from '@teambit/lanes';
import {
  MergingAspect,
  MergingMain,
  ComponentMergeStatus,
  ApplyVersionResults,
  FileStatus,
  MergeStrategy,
} from '@teambit/merging';
import { WorkspaceAspect, OutsideWorkspaceError, Workspace } from '@teambit/workspace';
import { ConfigStoreAspect, ConfigStoreMain } from '@teambit/config-store';
import { getBasicLog } from '@teambit/harmony.modules.get-basic-log';
import { ComponentID, ComponentIdList } from '@teambit/component-id';
import { Ref, Lane, Version, Log } from '@teambit/objects';
import pMapSeries from 'p-map-series';
import { Scope as LegacyScope } from '@teambit/legacy.scope';
import { ScopeAspect, ScopeMain } from '@teambit/scope';
import { DEFAULT_LANE, LaneId } from '@teambit/lane-id';
import { ConfigMergeResult } from '@teambit/config-merger';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { CheckoutAspect, CheckoutMain, CheckoutProps, throwForFailures } from '@teambit/checkout';
import { SnapsDistance } from '@teambit/component.snap-distance';
import { RemoveAspect, RemoveMain } from '@teambit/remove';
import { compact, uniq } from 'lodash';
import { ExportAspect, ExportMain } from '@teambit/export';
import { MergeLanesAspect } from './merge-lanes.aspect';
import { MergeLaneCmd } from './merge-lane.cmd';
import { MissingCompsToMerge } from './exceptions/missing-comps-to-merge';
import { MergeAbortLaneCmd, MergeAbortOpts } from './merge-abort.cmd';
import { LastMerged } from './last-merged';
import { MergeMoveLaneCmd } from './merge-move.cmd';
import { ExpressAspect, ExpressMain } from '@teambit/express';
import { LanesCheckConflictsRoute } from './lanes-check-conflicts.route';

export type MergeLaneOptions = {
  mergeStrategy: MergeStrategy;
  ours?: boolean;
  theirs?: boolean;
  noAutoSnap?: boolean;
  noSnap?: boolean;
  snapMessage?: string;
  existingOnWorkspaceOnly?: boolean;
  build?: boolean;
  keepReadme?: boolean;
  squash?: boolean;
  noSquash?: boolean;
  tag?: boolean;
  pattern?: string;
  includeDeps?: boolean;
  skipDependencyInstallation?: boolean;
  resolveUnrelated?: MergeStrategy;
  ignoreConfigChanges?: boolean;
  skipFetch?: boolean;
  excludeNonLaneComps?: boolean;
  shouldIncludeUpdateDependents?: boolean;
  throwIfNotUpToDate?: boolean; // relevant when merging from a scope
  fetchCurrent?: boolean; // needed when merging from a bare-scope (because it's empty)
  detachHead?: boolean;
};
export type ConflictPerId = { id: ComponentID; files: string[]; config?: boolean; configConflict?: string };

export class MergeLanesMain {
  constructor(
    private workspace: Workspace | undefined,
    private merging: MergingMain,
    readonly lanes: LanesMain,
    readonly logger: Logger,
    private remove: RemoveMain,
    private scope: ScopeMain,
    private exporter: ExportMain,
    private importer: ImporterMain,
    private checkout: CheckoutMain
  ) {}

  async mergeLaneByCLI(laneName: string, options: MergeLaneOptions) {
    if (!this.workspace) {
      throw new BitError(`unable to merge a lane outside of Bit workspace`);
    }
    const currentLaneId = this.workspace.consumer.getCurrentLaneId();
    const otherLaneId = await this.workspace.consumer.getParsedLaneId(laneName);
    return this.mergeLane(otherLaneId, currentLaneId, options);
  }

  /**
   * merge otherLaneId into currentLaneId
   */
  async mergeLane(
    otherLaneId: LaneId,
    currentLaneId: LaneId,
    options: MergeLaneOptions
  ): Promise<{
    mergeResults: ApplyVersionResults;
    deleteResults: any;
    configMergeResults: ConfigMergeResult[];
    mergedSuccessfullyIds: ComponentID[];
    conflicts: ConflictPerId[];
  }> {
    this.validateMergeFlags(otherLaneId, currentLaneId, options);
    const { currentLane, otherLane, laneToFetchArtifactsFrom, idsToMerge } = await this.resolveMergeContext(
      otherLaneId,
      currentLaneId,
      options
    );

    const {
      mergeStrategy,
      noAutoSnap,
      noSnap,
      tag,
      snapMessage,
      existingOnWorkspaceOnly,
      build,
      keepReadme,
      squash,
      noSquash,
      pattern,
      includeDeps,
      skipDependencyInstallation,
      resolveUnrelated,
      ignoreConfigChanges,
      throwIfNotUpToDate,
      detachHead,
    } = options;
    const legacyScope = this.scope.legacyScope;
    const consumer = this.workspace?.consumer;

    if (throwIfNotUpToDate) await this.throwIfNotUpToDate(otherLaneId, currentLaneId);

    this.logger.debug(`merging the following ids: ${idsToMerge.toString()}`);

    const shouldSquash = squash || (currentLaneId.isDefault() && !noSquash);
    let allComponentsStatus = await this.merging.getMergeStatus(
      idsToMerge,
      {
        resolveUnrelated,
        ignoreConfigChanges,
        shouldSquash,
        mergeStrategy,
        handleTargetAheadAsDiverged: noSnap,
        detachHead,
        shouldMergeAspectsData: true,
      },
      currentLane,
      otherLane
    );

    if (pattern) {
      const componentIds = idsToMerge;
      const compIdsFromPattern = await (this.workspace || this.scope).filterIdsFromPoolIdsByPattern(
        pattern,
        componentIds
      );
      allComponentsStatus = await filterComponentsStatus(
        allComponentsStatus,
        compIdsFromPattern,
        idsToMerge,
        legacyScope,
        includeDeps,
        otherLane,
        shouldSquash
      );
      idsToMerge.forEach((bitId) => {
        if (!allComponentsStatus.find((c) => c.id.isEqualWithoutVersion(bitId))) {
          allComponentsStatus.push({ id: bitId, unchangedLegitimately: true, unchangedMessage: `excluded by pattern` });
        }
      });
    }
    if (existingOnWorkspaceOnly && this.workspace) {
      const workspaceIds = this.workspace.listIds();
      const compIdsFromPattern = workspaceIds.filter((id) =>
        allComponentsStatus.find((c) => c.id.isEqualWithoutVersion(id))
      );
      allComponentsStatus = await filterComponentsStatus(
        allComponentsStatus,
        compIdsFromPattern,
        idsToMerge,
        legacyScope,
        includeDeps,
        otherLane,
        shouldSquash
      );
      idsToMerge.forEach((bitId) => {
        if (!allComponentsStatus.find((c) => c.id.isEqualWithoutVersion(bitId))) {
          allComponentsStatus.push({
            id: bitId,
            unchangedLegitimately: true,
            unchangedMessage: `not in the workspace`,
          });
        }
      });
    }

    throwForFailures(allComponentsStatus);

    const succeededComponents = allComponentsStatus.filter((c) => !c.unchangedMessage);
    if (shouldSquash) {
      await squashSnaps(succeededComponents, currentLaneId, otherLaneId, legacyScope, {
        messageTitle: options.snapMessage,
        detachHead,
      });
    }

    if (laneToFetchArtifactsFrom) {
      const ids = allComponentsStatus.map((c) => c.id);
      await this.importer.importHeadArtifactsFromLane(laneToFetchArtifactsFrom, ids, true);
    }

    const lastMerged = consumer ? new LastMerged(this.scope, consumer, this.logger) : undefined;
    const snapshot = await lastMerged?.takeSnapshot(currentLane);

    const mergeResults = await this.merging.mergeSnaps({
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
    });

    if (snapshot) await lastMerged?.persistSnapshot(snapshot);

    const mergedSuccessfully =
      !mergeResults.failedComponents ||
      mergeResults.failedComponents.length === 0 ||
      mergeResults.failedComponents.every((failedComponent) => failedComponent.unchangedLegitimately);

    let deleteResults = {};

    if (!keepReadme && otherLane && otherLane.readmeComponent && mergedSuccessfully) {
      const readmeComponentId = otherLane.readmeComponent.id.changeVersion(otherLane.readmeComponent?.head?.hash);
      deleteResults = await this.remove.removeLocallyByIds([readmeComponentId], { reasonForRemoval: 'lane-merge' });
    } else if (otherLane && !otherLane.readmeComponent) {
      deleteResults = { readmeResult: '' };
    }
    const configMergeResults = compact(allComponentsStatus.map((c) => c.configMergeResult));

    const mergedSnapIds = ComponentIdList.fromArray(
      mergeResults.mergeSnapResults?.snappedComponents.map((c) => c.id) || []
    );
    const componentsWithConfigConflicts = configMergeResults.filter((c) => c.hasConflicts()).map((c) => c.compIdStr);
    const conflicts: ConflictPerId[] = [];
    const mergedSuccessfullyIds: ComponentID[] = [];
    mergeResults.components?.forEach((c) => {
      const files = Object.keys(c.filesStatus).filter(
        (f) => c.filesStatus[f] === FileStatus.manual || c.filesStatus[f] === FileStatus.binaryConflict
      );
      const config = componentsWithConfigConflicts.includes(c.id.toStringWithoutVersion());
      if (files.length || config) {
        conflicts.push({ id: c.id, files, config });
      } else {
        const snappedId = mergedSnapIds.searchWithoutVersion(c.id);
        mergedSuccessfullyIds.push(snappedId || c.id);
      }
    });

    await this.workspace?.consumer.onDestroy(`lane-merge (${otherLaneId.name})`);

    return { mergeResults, deleteResults, configMergeResults, mergedSuccessfullyIds, conflicts };
  }

  private validateMergeFlags(otherLaneId: LaneId, currentLaneId: LaneId, options: MergeLaneOptions) {
    const { tag, resolveUnrelated, detachHead } = options;

    if (tag && !currentLaneId.isDefault()) {
      throw new BitError(`--tag only possible when on main. currently checked out to ${currentLaneId.toString()}`);
    }
    if (otherLaneId.isEqual(currentLaneId)) {
      throw new BitError(
        `unable to merge lane "${otherLaneId.toString()}", you're already at this lane. to get updates, simply run "bit checkout head"`
      );
    }
    if (resolveUnrelated && currentLaneId.isDefault()) {
      throw new BitError(
        `unable to resolve unrelated when on main. switch to ${otherLaneId.toString()} and run "bit lane merge main --resolve-unrelated"`
      );
    }
    if (detachHead && !currentLaneId.isDefault()) {
      throw new BitError(`unable to detach head. the current lane is not main`);
    }
  }

  private async resolveMergeContext(otherLaneId: LaneId, currentLaneId: LaneId, options: Partial<MergeLaneOptions>) {
    const { skipFetch, excludeNonLaneComps, shouldIncludeUpdateDependents, fetchCurrent } = options;
    const legacyScope = this.scope.legacyScope;
    if (fetchCurrent && !currentLaneId.isDefault()) {
      // if current is default, it'll be fetch later on
      await this.lanes.fetchLaneWithItsComponents(currentLaneId);
    }
    const currentLane = currentLaneId.isDefault() ? undefined : await legacyScope.loadLane(currentLaneId);
    const isDefaultLane = otherLaneId.isDefault();
    if (isDefaultLane) {
      if (!skipFetch) {
        const ids = await this.getMainIdsToMerge(currentLane, !excludeNonLaneComps);
        const compIdList = ComponentIdList.fromArray(ids).toVersionLatest();
        await this.importer.importObjectsFromMainIfExist(compIdList);
      }
    }
    let laneToFetchArtifactsFrom: Lane | undefined;
    const getOtherLane = async () => {
      let lane = await legacyScope.loadLane(otherLaneId);
      const shouldFetch = !lane || (!skipFetch && !lane.isNew);
      if (shouldFetch) {
        // don't assign `lane` to the result of this command. otherwise, if you have local snaps, it'll ignore them and use the remote-lane.
        const otherLane = await this.lanes.fetchLaneWithItsComponents(otherLaneId, shouldIncludeUpdateDependents);
        laneToFetchArtifactsFrom = otherLane;
        lane = await legacyScope.loadLane(otherLaneId);
      }
      return lane;
    };
    const otherLane = isDefaultLane ? undefined : await getOtherLane();
    if (fetchCurrent && otherLane && currentLaneId.isDefault()) {
      const ids = await this.getMainIdsToMerge(otherLane, false, shouldIncludeUpdateDependents);
      const compIdList = ComponentIdList.fromArray(ids).toVersionLatest();
      await this.importer.importObjectsFromMainIfExist(compIdList);
    }
    const getBitIds = async () => {
      if (isDefaultLane) {
        const ids = await this.getMainIdsToMerge(currentLane, !excludeNonLaneComps, shouldIncludeUpdateDependents);
        const modelComponents = await Promise.all(ids.map((id) => this.scope.legacyScope.getModelComponent(id)));
        return compact(
          modelComponents.map((c) => {
            if (!c.head) return null; // probably the component was never merged to main
            return c.toComponentId().changeVersion(c.head.toString());
          })
        );
      }
      if (!otherLane) throw new Error(`lane must be defined for non-default`);
      return shouldIncludeUpdateDependents
        ? otherLane.toComponentIdsIncludeUpdateDependents()
        : otherLane.toComponentIds();
    };
    const idsToMerge = await getBitIds();

    return {
      currentLane,
      otherLane,
      laneToFetchArtifactsFrom,
      idsToMerge,
    };
  }

  /**
   * check conflicts in case of merging sourceLaneId into targetLaneId
   */
  async checkLaneForConflicts(
    sourceLaneIdStr: string,
    targetLaneIdStr: string,
    options: Partial<MergeLaneOptions>
  ): Promise<{
    conflicts: ConflictPerId[];
  }> {
    const legacyScope = this.scope.legacyScope;
    const otherLaneId: LaneId = await legacyScope.lanes.parseLaneIdFromString(sourceLaneIdStr);
    const currentLaneId: LaneId = await legacyScope.lanes.parseLaneIdFromString(targetLaneIdStr);
    options.excludeNonLaneComps = true;
    const { currentLane, otherLane, idsToMerge } = await this.resolveMergeContext(otherLaneId, currentLaneId, options);

    const allComponentsStatus = await this.merging.getMergeStatus(
      idsToMerge,
      {
        mergeStrategy: 'manual',
      },
      currentLane,
      otherLane
    );

    throwForFailures(allComponentsStatus);

    const configMergeResults = compact(allComponentsStatus.map((c) => c.configMergeResult));
    const componentsWithConfigConflicts = configMergeResults.filter((c) => c.hasConflicts()).map((c) => c.compIdStr);
    const conflicts: ConflictPerId[] = [];
    allComponentsStatus.forEach((c) => {
      const files = c.mergeResults?.modifiedFiles.filter((f) => f.conflict || f.isBinaryConflict) || [];
      const config = componentsWithConfigConflicts.includes(c.id.toStringWithoutVersion());
      if (files.length || config) {
        const configData = configMergeResults.find((co) => co.compIdStr === c.id.toStringWithoutVersion());
        const configConflict = configData?.generateMergeConflictFile() || undefined;
        conflicts.push({ id: c.id, files: files.map((f) => f.filePath), config, configConflict });
      }
    });

    return { conflicts };
  }

  async mergeMove(newLaneName: string, options: { scope?: string }) {
    if (!this.workspace) throw new OutsideWorkspaceError();
    const lastMerge = new LastMerged(this.scope, this.workspace.consumer, this.logger);
    await lastMerge.restoreLaneObjectFromLastMerged();
    const newLaneResult = await this.lanes.createLane(newLaneName, { scope: options.scope });
    return newLaneResult;
  }

  async abortLaneMerge(checkoutProps: CheckoutProps, mergeAbortOpts: MergeAbortOpts) {
    if (!this.workspace) throw new OutsideWorkspaceError();
    const lastMerge = new LastMerged(this.scope, this.workspace.consumer, this.logger);
    const currentLane = await this.lanes.getCurrentLane();
    const { compDirsToRemove } = await lastMerge.restoreFromLastMerged(mergeAbortOpts, currentLane);

    await this.workspace._reloadConsumer();

    this.workspace.consumer.scope.objects.unmergedComponents.removeAllComponents();
    await this.workspace.consumer.scope.objects.unmergedComponents.write();

    const configMergeFile = this.workspace.getConflictMergeFile();
    await configMergeFile.delete();

    let checkoutResults: ApplyVersionResults | undefined;
    let checkoutError: Error | undefined;
    checkoutProps.ids = this.workspace.listIds();
    checkoutProps.restoreMissingComponents = true;
    try {
      checkoutResults = await this.checkout.checkout(checkoutProps);
    } catch (err: any) {
      this.logger.error(`merge-abort got an error during the checkout stage`, err);
      checkoutError = err;
    }

    const restoredItems = [
      `${path.basename(this.workspace.consumer.bitMap.mapPath)} file`,
      `${path.basename(this.workspace.consumer.config.path)} file`,
    ];
    if (compDirsToRemove.length) {
      restoredItems.push(`deleted components directories: ${compDirsToRemove.join(', ')}`);
    }
    if (currentLane) {
      restoredItems.push(`${currentLane.id()} lane object`);
    }

    return { checkoutResults, restoredItems, checkoutError };
  }

  private async getMainIdsToMerge(lane?: Lane | null, includeNonLaneComps = true, includeUpdateDependents = false) {
    if (!lane) throw new Error(`unable to merge ${DEFAULT_LANE}, the current lane was not found`);
    const laneIds = includeUpdateDependents ? lane.toComponentIdsIncludeUpdateDependents() : lane.toComponentIds();
    const ids = laneIds.filter((id) => this.scope.isExported(id));
    if (includeNonLaneComps) {
      if (!this.workspace) {
        throw new BitError(`getMainIdsToMerge needs workspace`);
      }
      const workspaceIds = this.workspace.listIds();
      const mainNotOnLane = workspaceIds.filter(
        (id) => !laneIds.find((laneId) => laneId.isEqualWithoutVersion(id)) && this.scope.isExported(id)
      );
      ids.push(...mainNotOnLane);
    }
    return ids;
  }

  private async throwIfNotUpToDate(fromLaneId: LaneId, toLaneId: LaneId) {
    const status = await this.lanes.diffStatus(fromLaneId, toLaneId, { skipChanges: true });
    const compsNotUpToDate = status.componentsStatus.filter((s) => !s.upToDate);
    if (compsNotUpToDate.length) {
      throw new Error(`unable to merge, the following components are not up-to-date:
${compsNotUpToDate.map((s) => s.componentId.toString()).join('\n')}`);
    }
  }

  static slots = [];
  static dependencies = [
    LanesAspect,
    CLIAspect,
    WorkspaceAspect,
    MergingAspect,
    LoggerAspect,
    RemoveAspect,
    ScopeAspect,
    ExportAspect,
    ImporterAspect,
    CheckoutAspect,
    ConfigStoreAspect,
    ExpressAspect,
  ];
  static runtime = MainRuntime;

  static async provider([
    lanes,
    cli,
    workspace,
    merging,
    loggerMain,
    remove,
    scope,
    exporter,
    importer,
    checkout,
    configStore,
    express,
  ]: [
    LanesMain,
    CLIMain,
    Workspace,
    MergingMain,
    LoggerMain,
    RemoveMain,
    ScopeMain,
    ExportMain,
    ImporterMain,
    CheckoutMain,
    ConfigStoreMain,
    ExpressMain,
  ]) {
    const logger = loggerMain.createLogger(MergeLanesAspect.id);
    const lanesCommand = cli.getCommand('lane');
    const mergeLanesMain = new MergeLanesMain(
      workspace,
      merging,
      lanes,
      logger,
      remove,
      scope,
      exporter,
      importer,
      checkout
    );
    lanesCommand?.commands?.push(new MergeLaneCmd(mergeLanesMain, configStore));
    lanesCommand?.commands?.push(new MergeAbortLaneCmd(mergeLanesMain));
    lanesCommand?.commands?.push(new MergeMoveLaneCmd(mergeLanesMain));
    express.register([new LanesCheckConflictsRoute(mergeLanesMain, logger)]);
    return mergeLanesMain;
  }
}

async function filterComponentsStatus(
  allComponentsStatus: ComponentMergeStatus[],
  compIdsToKeep: ComponentID[],
  allBitIds: ComponentID[],
  legacyScope: LegacyScope,
  includeDeps = false,
  otherLane?: Lane, // lane that gets merged into the current lane. if not provided, it's main that gets merged into the current lane
  shouldSquash?: boolean
): Promise<ComponentMergeStatus[]> {
  const bitIdsFromPattern = ComponentIdList.fromArray(compIdsToKeep);
  const bitIdsNotFromPattern = allBitIds.filter((bitId) => !bitIdsFromPattern.hasWithoutVersion(bitId));
  const filteredComponentStatus: ComponentMergeStatus[] = [];
  const depsToAdd: ComponentID[] = [];
  const missingDepsFromHead = {};
  const missingDepsFromHistory: string[] = [];

  const versionsToCheckPerId = await pMapSeries(compIdsToKeep, async (compId) => {
    const fromStatus = allComponentsStatus.find((c) => c.id.isEqualWithoutVersion(compId));
    if (!fromStatus) {
      throw new Error(`filterComponentsStatus: unable to find ${compId.toString()} in component-status`);
    }
    filteredComponentStatus.push(fromStatus);
    if (fromStatus.unchangedMessage) {
      return undefined;
    }
    if (!otherLane) {
      // if merging main, no need to check whether the deps are included in the pattern.
      return undefined;
    }
    const { divergeData } = fromStatus;
    if (!divergeData) {
      throw new Error(`filterComponentsStatus: unable to find divergeData for ${compId.toString()}`);
    }
    let targetVersions: Ref[] = divergeData.snapsOnTargetOnly;
    if (!targetVersions.length) {
      return undefined;
    }
    const modelComponent = await legacyScope.getModelComponent(compId);
    if (shouldSquash) {
      // no need to check all versions, we merge only the head
      const headOnTarget = otherLane ? otherLane.getCompHeadIncludeUpdateDependents(compId) : modelComponent.head;
      if (!headOnTarget) {
        throw new Error(`filterComponentsStatus: unable to find head for ${compId.toString()}`);
      }
      targetVersions = [headOnTarget];
    }

    return { compId, targetVersions, modelComponent };
  });

  // all these versions needs to be imported to load them later and check whether they have dependencies on the target lane
  const toImport = compact(versionsToCheckPerId)
    .map((c) => c.targetVersions.map((v) => c.compId.changeVersion(v.toString())))
    .flat();
  await legacyScope.scopeImporter.importWithoutDeps(ComponentIdList.fromArray(toImport), {
    lane: otherLane,
    cache: true,
    includeVersionHistory: false,
    reason: 'import all history of given patterns components to check whether they have dependencies on the lane',
  });

  await pMapSeries(compact(versionsToCheckPerId), async ({ compId, targetVersions, modelComponent }) => {
    await pMapSeries(targetVersions, async (remoteVersion) => {
      const versionObj = await modelComponent.loadVersion(remoteVersion.toString(), legacyScope.objects);
      const flattenedDeps = versionObj.getAllFlattenedDependencies();
      const depsNotIncludeInPattern = flattenedDeps.filter((id) =>
        bitIdsNotFromPattern.find((bitId) => bitId.isEqualWithoutVersion(id))
      );
      if (!depsNotIncludeInPattern.length) {
        return;
      }
      const depsOnLane: ComponentID[] = [];
      await Promise.all(
        depsNotIncludeInPattern.map(async (dep) => {
          const isOnLane = await legacyScope.isIdOnLane(dep, otherLane);
          if (isOnLane) {
            depsOnLane.push(dep);
          }
        })
      );
      if (!depsOnLane.length) {
        return;
      }
      if (includeDeps) {
        depsToAdd.push(...depsOnLane);
      } else {
        const headOnTarget = otherLane ? otherLane.getCompHeadIncludeUpdateDependents(compId) : modelComponent.head;
        const depsOnLaneStr = depsOnLane.map((dep) => dep.toStringWithoutVersion());
        if (headOnTarget?.isEqual(remoteVersion)) {
          depsOnLaneStr.forEach((dep) => {
            (missingDepsFromHead[dep] ||= []).push(compId.toStringWithoutVersion());
          });
        } else {
          missingDepsFromHistory.push(...depsOnLaneStr);
        }
      }
    });
  });
  if (Object.keys(missingDepsFromHead).length || missingDepsFromHistory.length) {
    throw new MissingCompsToMerge(missingDepsFromHead, uniq(missingDepsFromHistory));
  }

  if (depsToAdd.length) {
    // remove the version, otherwise, the uniq gives duplicate components with different versions.
    const depsWithoutVersion = depsToAdd.map((d) => d.changeVersion(undefined));
    const depsUniqWithoutVersion = ComponentIdList.uniqFromArray(depsWithoutVersion);
    depsUniqWithoutVersion.forEach((id) => {
      const fromStatus = allComponentsStatus.find((c) => c.id.isEqualWithoutVersion(id));
      if (!fromStatus) {
        throw new Error(`filterComponentsStatus: unable to find ${id.toString()} in component-status`);
      }
      filteredComponentStatus.push(fromStatus);
    });
  }
  return filteredComponentStatus;
}

async function getLogForSquash(otherLaneId: LaneId) {
  const basicLog = await getBasicLog();
  const log = {
    ...basicLog,
    message: `squashed during merge from ${otherLaneId.toString()}`,
  };
  return log;
}

async function squashSnaps(
  succeededComponents: ComponentMergeStatus[],
  currentLaneId: LaneId,
  otherLaneId: LaneId,
  scope: LegacyScope,
  opts: { messageTitle?: string; detachHead?: boolean } = {}
) {
  const currentLaneName = currentLaneId.name;
  const log = await getLogForSquash(otherLaneId);

  await Promise.all(
    succeededComponents.map(async ({ id, divergeData, componentFromModel }) => {
      if (!divergeData) {
        throw new Error(`unable to squash. divergeData is missing from ${id.toString()}`);
      }

      const modifiedComp = await squashOneComp(
        currentLaneName,
        otherLaneId,
        id,
        divergeData,
        log,
        scope,
        componentFromModel,
        opts
      );
      if (modifiedComp) {
        scope.objects.add(modifiedComp);
        const modelComponent = await scope.getModelComponent(id);
        const versionHistory = await modelComponent.updateRebasedVersionHistory(scope.objects, [modifiedComp]);
        if (versionHistory) scope.objects.add(versionHistory);
      }
    })
  );
}

/**
 * returns Version object if it was modified. otherwise, returns undefined
 */
async function squashOneComp(
  currentLaneName: string,
  otherLaneId: LaneId,
  id: ComponentID,
  divergeData: SnapsDistance,
  log: Log,
  scope: LegacyScope,
  componentFromModel?: Version,
  opts: { messageTitle?: string; detachHead?: boolean } = {}
): Promise<Version | undefined> {
  const { messageTitle, detachHead } = opts;
  const shouldSquash = () => {
    if (divergeData.isDiverged()) {
      if (detachHead) {
        // for detach head, it's ok to have it as diverged. as long as the target is ahead, we want to squash.
        return true;
      }
      throw new BitError(`unable to squash because ${id.toString()} is diverged in history.
  consider switching to "${
    otherLaneId.name
  }" first, merging "${currentLaneName}", then switching back to "${currentLaneName}" and merging "${otherLaneId.name}"
  alternatively, use "--no-squash" flag to keep the entire history of "${otherLaneId.name}"`);
    }
    if (divergeData.isSourceAhead()) {
      // nothing to do. current is ahead, nothing to merge. (it was probably filtered out already as a "failedComponent")
      return false;
    }
    if (!divergeData.isTargetAhead()) {
      // nothing to do. current and remote are the same, nothing to merge. (it was probably filtered out already as a "failedComponent")
      return false;
    }
    return true;
  };

  if (!shouldSquash()) {
    return undefined;
  }

  // remote is ahead and was not diverge.
  const remoteSnaps = divergeData.snapsOnTargetOnly;
  if (remoteSnaps.length === 0) {
    throw new Error(`remote is ahead but it has no snaps. it's impossible`);
  }
  const getAllMessages = async () => {
    if (!messageTitle) return [];
    await scope.scopeImporter.importManyObjects({ [otherLaneId.scope]: remoteSnaps.map((s) => s.toString()) });
    const versionObjects = (await Promise.all(remoteSnaps.map((s) => scope.objects.load(s)))) as Version[];
    return compact(versionObjects).map((v) => v.log.message);
  };
  const getFinalMessage = async (): Promise<string | undefined> => {
    if (!messageTitle) return undefined;
    const allMessage = await getAllMessages();
    const allMessageStr = compact(allMessage)
      .map((m) => `[*] ${m}`)
      .join('\n');
    return `${messageTitle}\n${allMessageStr}`;
  };
  if (!componentFromModel) {
    throw new Error('unable to squash, the componentFromModel is missing');
  }
  const currentParents = componentFromModel.parents;

  // if the remote has only one snap, there is nothing to squash.
  // other checks here is to make sure `componentFromModel.addAsOnlyParent` call is not needed.
  if (remoteSnaps.length === 1 && divergeData.commonSnapBeforeDiverge && currentParents.length === 1) {
    return undefined;
  }

  const doSquash = async () => {
    if (divergeData.commonSnapBeforeDiverge) {
      componentFromModel.addAsOnlyParent(divergeData.commonSnapBeforeDiverge);
      return;
    }
    if (currentLaneName !== DEFAULT_LANE) {
      // when squashing into lane, we have to take main into account
      const modelComponent = await scope.getModelComponentIfExist(id);
      if (!modelComponent) throw new Error(`missing ModelComponent for ${id.toString()}`);
      if (modelComponent.head) {
        componentFromModel.addAsOnlyParent(modelComponent.head);
        return;
      }
    }
    // there is no commonSnapBeforeDiverge. the local has no snaps, all are remote, no need for parents. keep only head.
    componentFromModel.parents.forEach((ref) => componentFromModel.removeParent(ref));
  };

  await doSquash();

  const finalMessage = await getFinalMessage();
  componentFromModel.setSquashed({ previousParents: currentParents, laneId: otherLaneId }, log, finalMessage);
  return componentFromModel;
}

MergeLanesAspect.addRuntime(MergeLanesMain);

export default MergeLanesMain;
