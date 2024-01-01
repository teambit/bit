import { BitError } from '@teambit/bit-error';
import path from 'path';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import ImporterAspect, { ImporterMain } from '@teambit/importer';
import { LanesAspect, LanesMain } from '@teambit/lanes';
import MergingAspect, {
  MergingMain,
  ComponentMergeStatus,
  ConfigMergeResult,
  ApplyVersionResults,
} from '@teambit/merging';
import WorkspaceAspect, { OutsideWorkspaceError, Workspace } from '@teambit/workspace';
import { getBasicLog } from '@teambit/snapping';
import { ComponentID, ComponentIdList } from '@teambit/component-id';
import { Log } from '@teambit/legacy/dist/scope/models/version';
import pMapSeries from 'p-map-series';
import { Scope as LegacyScope } from '@teambit/legacy/dist/scope';
import { Consumer } from '@teambit/legacy/dist/consumer';
import { MergeStrategy } from '@teambit/legacy/dist/consumer/versions-ops/merge-version';
import { ScopeAspect, ScopeMain } from '@teambit/scope';
import ScopeComponentsImporter from '@teambit/legacy/dist/scope/component-ops/scope-components-importer';
import { DEFAULT_LANE, LaneId } from '@teambit/lane-id';
import { Lane, Version } from '@teambit/legacy/dist/scope/models';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import CheckoutAspect, { CheckoutMain, CheckoutProps, throwForFailures } from '@teambit/checkout';
import { SnapsDistance } from '@teambit/legacy/dist/scope/component-ops/snaps-distance';
import { RemoveAspect, RemoveMain } from '@teambit/remove';
import { compact, uniq } from 'lodash';
import { ExportAspect, ExportMain } from '@teambit/export';
import GlobalConfigAspect, { GlobalConfigMain } from '@teambit/global-config';
import { BitObject, Ref } from '@teambit/legacy/dist/scope/objects';
import { getDivergeData } from '@teambit/legacy/dist/scope/component-ops/get-diverge-data';
import { MergeLanesAspect } from './merge-lanes.aspect';
import { MergeLaneCmd } from './merge-lane.cmd';
import { MergeLaneFromScopeCmd } from './merge-lane-from-scope.cmd';
import { MissingCompsToMerge } from './exceptions/missing-comps-to-merge';
import { MergeAbortLaneCmd, MergeAbortOpts } from './merge-abort.cmd';
import { LastMerged } from './last-merged';

export type MergeLaneOptions = {
  mergeStrategy: MergeStrategy;
  ours?: boolean;
  theirs?: boolean;
  noSnap: boolean;
  snapMessage: string;
  existingOnWorkspaceOnly: boolean;
  build: boolean;
  keepReadme: boolean;
  squash?: boolean;
  noSquash: boolean;
  tag?: boolean;
  pattern?: string;
  includeDeps?: boolean;
  skipDependencyInstallation?: boolean;
  resolveUnrelated?: MergeStrategy;
  ignoreConfigChanges?: boolean;
  skipFetch?: boolean;
  excludeNonLaneComps?: boolean;
};

export class MergeLanesMain {
  constructor(
    private workspace: Workspace | undefined,
    private merging: MergingMain,
    private lanes: LanesMain,
    readonly logger: Logger,
    private remove: RemoveMain,
    private scope: ScopeMain,
    private exporter: ExportMain,
    private importer: ImporterMain,
    private checkout: CheckoutMain
  ) {}

  // eslint-disable-next-line complexity
  async mergeLane(
    laneName: string,
    options: MergeLaneOptions
  ): Promise<{ mergeResults: ApplyVersionResults; deleteResults: any; configMergeResults: ConfigMergeResult[] }> {
    if (!this.workspace) {
      throw new BitError(`unable to merge a lane outside of Bit workspace`);
    }
    const consumer = this.workspace.consumer;

    const {
      mergeStrategy,
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
      skipFetch,
      excludeNonLaneComps,
    } = options;

    const currentLaneId = consumer.getCurrentLaneId();
    if (tag && !currentLaneId.isDefault()) {
      throw new BitError(`--tag only possible when on main. currently checked out to ${currentLaneId.toString()}`);
    }
    const otherLaneId = await consumer.getParsedLaneId(laneName);
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
    const currentLane = currentLaneId.isDefault() ? null : await consumer.scope.loadLane(currentLaneId);
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
      let lane = await consumer.scope.loadLane(otherLaneId);
      const shouldFetch = !lane || (!skipFetch && !lane.isNew);
      if (shouldFetch) {
        // don't assign `lane` to the result of this command. otherwise, if you have local snaps, it'll ignore them and use the remote-lane.
        const otherLane = await this.lanes.fetchLaneWithItsComponents(otherLaneId);
        laneToFetchArtifactsFrom = otherLane;
        lane = await consumer.scope.loadLane(otherLaneId);
      }
      return lane;
    };
    const otherLane = isDefaultLane ? undefined : await getOtherLane();
    const getBitIds = async () => {
      if (isDefaultLane) {
        const ids = await this.getMainIdsToMerge(currentLane, !excludeNonLaneComps);
        const modelComponents = await Promise.all(ids.map((id) => this.scope.legacyScope.getModelComponent(id)));
        return compact(
          modelComponents.map((c) => {
            if (!c.head) return null; // probably the component was never merged to main
            return c.toComponentId().changeVersion(c.head.toString());
          })
        );
      }
      if (!otherLane) throw new Error(`lane must be defined for non-default`);
      return otherLane.toBitIds();
    };
    const idsToMerge = await getBitIds();
    this.logger.debug(`merging the following ids: ${idsToMerge.toString()}`);

    const shouldSquash = squash || (currentLaneId.isDefault() && !noSquash);
    let allComponentsStatus = await this.merging.getMergeStatus(idsToMerge, currentLane, otherLane, {
      resolveUnrelated,
      ignoreConfigChanges,
      shouldSquash,
    });

    if (pattern) {
      const componentIds = await this.workspace.resolveMultipleComponentIds(idsToMerge);
      const compIdsFromPattern = await this.workspace.filterIdsFromPoolIdsByPattern(pattern, componentIds);
      allComponentsStatus = await filterComponentsStatus(
        allComponentsStatus,
        compIdsFromPattern,
        idsToMerge,
        this.workspace,
        includeDeps,
        otherLane || undefined,
        shouldSquash
      );
      idsToMerge.forEach((bitId) => {
        if (!allComponentsStatus.find((c) => c.id.isEqualWithoutVersion(bitId))) {
          allComponentsStatus.push({ id: bitId, unchangedLegitimately: true, unchangedMessage: `excluded by pattern` });
        }
      });
    }
    if (existingOnWorkspaceOnly) {
      const workspaceIds = await this.workspace.listIds();
      const compIdsFromPattern = workspaceIds.filter((id) =>
        allComponentsStatus.find((c) => c.id.isEqualWithoutVersion(id))
      );
      allComponentsStatus = await filterComponentsStatus(
        allComponentsStatus,
        compIdsFromPattern,
        idsToMerge,
        this.workspace,
        includeDeps,
        otherLane || undefined,
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

    if (shouldSquash) {
      await squashSnaps(allComponentsStatus, otherLaneId, consumer);
    }

    if (laneToFetchArtifactsFrom) {
      const ids = allComponentsStatus.map((c) => c.id);
      await this.importer.importHeadArtifactsFromLane(laneToFetchArtifactsFrom, ids, true);
    }

    const lastMerged = new LastMerged(this.scope, consumer, this.logger);
    const snapshot = await lastMerged.takeSnapshot(currentLane);

    const mergeResults = await this.merging.mergeSnaps({
      mergeStrategy,
      allComponentsStatus,
      otherLaneId,
      currentLane,
      noSnap,
      tag,
      snapMessage,
      build,
      skipDependencyInstallation,
    });

    await lastMerged.persistSnapshot(snapshot);

    const mergedSuccessfully =
      !mergeResults.failedComponents ||
      mergeResults.failedComponents.length === 0 ||
      mergeResults.failedComponents.every((failedComponent) => failedComponent.unchangedLegitimately);

    let deleteResults = {};

    if (!keepReadme && otherLane && otherLane.readmeComponent && mergedSuccessfully) {
      const readmeComponentId = otherLane.readmeComponent.id.changeVersion(otherLane.readmeComponent?.head?.hash);
      deleteResults = await this.remove.removeLocallyByIds([readmeComponentId]);
    } else if (otherLane && !otherLane.readmeComponent) {
      deleteResults = { readmeResult: '' };
    }
    const configMergeResults = allComponentsStatus.map((c) => c.configMergeResult);

    await this.workspace.consumer.onDestroy(`lane-merge (${otherLaneId.name})`);

    return { mergeResults, deleteResults, configMergeResults: compact(configMergeResults) };
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
    checkoutProps.ids = await this.workspace.listIds();
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

  private async getMainIdsToMerge(lane?: Lane | null, includeNonLaneComps = true) {
    if (!lane) throw new Error(`unable to merge ${DEFAULT_LANE}, the current lane was not found`);
    const laneIds = lane.toBitIds();
    const ids = laneIds.filter((id) => this.scope.isExported(id));
    if (includeNonLaneComps) {
      if (!this.workspace) {
        throw new BitError(`getMainIdsToMerge needs workspace`);
      }
      const workspaceIds = await this.workspace.listIds();
      const mainNotOnLane = workspaceIds.filter(
        (id) => !laneIds.find((laneId) => laneId.isEqualWithoutVersion(id)) && this.scope.isExported(id)
      );
      ids.push(...mainNotOnLane);
    }
    return ids;
  }

  async mergeFromScope(
    fromLane: string,
    toLane: string,
    options: Partial<MergeLaneOptions> & { push?: boolean }
  ): Promise<{
    mergedPreviously: string[];
    mergedNow: string[];
    exportedIds: string[];
  }> {
    if (this.workspace) {
      throw new BitError(
        `unable to run this command from a workspace, please create a new bare-scope and run it from there`
      );
    }
    const fromLaneId = LaneId.parse(fromLane);
    const fromLaneObj = await this.lanes.importLaneObject(fromLaneId);
    const toLaneId = toLane === DEFAULT_LANE ? this.lanes.getDefaultLaneId() : LaneId.parse(toLane);
    const toLaneObj = toLaneId.isDefault() ? undefined : await this.lanes.importLaneObject(toLaneId);
    const fromLaneBitIds = fromLaneObj.toBitIds();
    const getIdsToMerge = async (): Promise<ComponentIdList> => {
      if (!options.pattern) return fromLaneBitIds;
      const laneCompIds = await this.scope.resolveMultipleComponentIds(fromLaneBitIds);
      const ids = await this.scope.filterIdsFromPoolIdsByPattern(options.pattern, laneCompIds);
      return ComponentIdList.fromArray(ids.map((id) => id));
    };
    const idsToMerge = await getIdsToMerge();
    const scopeComponentsImporter = ScopeComponentsImporter.getInstance(this.scope.legacyScope);
    await scopeComponentsImporter.importWithoutDeps(idsToMerge.toVersionLatest(), {
      cache: false,
      lane: fromLaneObj,
      ignoreMissingHead: true,
      includeVersionHistory: true,
      reason: `of "from" lane (${fromLaneId.name}) for lane-merge to get all version-history`,
    });

    // get their main/to-lane as well
    await scopeComponentsImporter.importWithoutDeps(idsToMerge.toVersionLatest(), {
      cache: false,
      lane: toLaneObj,
      ignoreMissingHead: true,
      includeVersionHistory: true,
      reason: `of "to" lane (${toLaneId.name}) for lane-merge to get all version-history`,
    });
    await this.importer.importHeadArtifactsFromLane(fromLaneObj, undefined, true);
    await this.throwIfNotUpToDate(fromLaneId, toLaneId);
    const repo = this.scope.legacyScope.objects;
    // loop through all components, make sure they're all ahead of main (it might not be on main yet).
    // then, change the version object to include an extra parent to point to the main.
    // then, change the component object head to point to this changed version
    const mergedPreviously: ComponentID[] = [];
    const mergedNow: ComponentID[] = [];
    const shouldSquash = !toLaneObj && !options.noSquash; // only when merging to main we squash.
    const log = await getLogForSquash(fromLaneId);
    const bitObjectsPerComp = await pMapSeries(idsToMerge, async (id) => {
      const modelComponent = await this.scope.legacyScope.getModelComponent(id);
      const fromVersionObj = await modelComponent.loadVersion(id.version as string, repo);
      if (fromVersionObj.isRemoved()) return undefined;
      const fromLaneHead = modelComponent.getRef(id.version as string);
      if (!fromLaneHead) throw new Error(`lane head must be defined for ${id.toString()}`);
      const toLaneHead = toLaneObj ? toLaneObj.getComponent(id)?.head : modelComponent.head || null;
      if (toLaneHead?.isEqual(fromLaneHead)) {
        mergedPreviously.push(id);
        return undefined;
      }

      const divergeData = await getDivergeData({
        repo,
        modelComponent,
        sourceHead: toLaneHead,
        targetHead: fromLaneHead,
        throwForNoCommonSnap: true,
      });
      const modifiedVersion = shouldSquash
        ? await squashOneComp(
            DEFAULT_LANE,
            fromLaneId,
            id,
            divergeData,
            log,
            this.scope.legacyScope,
            fromVersionObj,
            options.snapMessage
          )
        : undefined;
      const objects: BitObject[] = [];
      if (modifiedVersion) objects.push(modifiedVersion);
      if (toLaneObj) {
        toLaneObj.addComponent({ id: id.changeVersion(undefined), head: fromLaneHead });
      } else {
        modelComponent.setHead(fromLaneHead);
        objects.push(modelComponent);
      }
      mergedNow.push(id);
      return { id, objects };
    });
    const bitObjects = compact(bitObjectsPerComp).map((b) => b.objects);
    const bitObjectsFlat = bitObjects.flat();
    if (toLaneObj) bitObjectsFlat.push(toLaneObj);
    await repo.writeObjectsToTheFS(bitObjectsFlat);
    let exportedIds: string[] = [];
    if (options.push) {
      const ids = compact(bitObjectsPerComp).map((b) => b.id);
      const bitIds = ComponentIdList.fromArray(ids);
      const { exported } = await this.exporter.exportMany({
        scope: this.scope.legacyScope,
        ids: shouldSquash ? bitIds : new ComponentIdList(),
        idsWithFutureScope: shouldSquash ? bitIds : new ComponentIdList(),
        laneObject: toLaneObj,
        allVersions: false,
        // no need to export anything else other than the head. the normal calculation of what to export won't apply here
        // as it is done from the scope.
        exportHeadsOnly: shouldSquash,
        // all artifacts must be pushed. they're all considered "external" in this case, because it's running from a
        // bare-scope, but we don't want to ignore them, otherwise, they'll be missing from the component-scopes.
        ignoreMissingExternalArtifacts: false,
        exportOrigin: 'lane-merge',
      });
      exportedIds = exported.map((id) => id.toString());
    }

    return {
      mergedPreviously: mergedPreviously.map((id) => id.toString()),
      mergedNow: mergedNow.map((id) => id.toString()),
      exportedIds,
    };
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
    GlobalConfigAspect,
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
    globalConfig,
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
    GlobalConfigMain
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
    lanesCommand?.commands?.push(new MergeLaneCmd(mergeLanesMain, globalConfig));
    lanesCommand?.commands?.push(new MergeAbortLaneCmd(mergeLanesMain));
    cli.register(new MergeLaneFromScopeCmd(mergeLanesMain));
    return mergeLanesMain;
  }
}

async function filterComponentsStatus(
  allComponentsStatus: ComponentMergeStatus[],
  compIdsToKeep: ComponentID[],
  allBitIds: ComponentID[],
  workspace: Workspace,
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
    const modelComponent = await workspace.consumer.scope.getModelComponent(compId);
    if (shouldSquash) {
      // no need to check all versions, we merge only the head
      const headOnTarget = otherLane ? otherLane.getComponent(compId)?.head : modelComponent.head;
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
  await workspace.consumer.scope.scopeImporter.importWithoutDeps(ComponentIdList.fromArray(toImport), {
    lane: otherLane,
    cache: true,
    includeVersionHistory: false,
    reason: 'import all history of given patterns components to check whether they have dependencies on the lane',
  });

  await pMapSeries(compact(versionsToCheckPerId), async ({ compId, targetVersions, modelComponent }) => {
    await pMapSeries(targetVersions, async (remoteVersion) => {
      const versionObj = await modelComponent.loadVersion(remoteVersion.toString(), workspace.consumer.scope.objects);
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
          const isOnLane = await workspace.consumer.scope.isIdOnLane(dep, otherLane);
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
        const headOnTarget = otherLane ? otherLane.getComponent(compId)?.head : modelComponent.head;
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

async function squashSnaps(allComponentsStatus: ComponentMergeStatus[], otherLaneId: LaneId, consumer: Consumer) {
  const currentLaneName = consumer.getCurrentLaneId().name;
  const succeededComponents = allComponentsStatus.filter((c) => !c.unchangedMessage);
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
        consumer.scope,
        componentFromModel
      );
      if (modifiedComp) {
        consumer.scope.objects.add(modifiedComp);
        const modelComponent = await consumer.scope.getModelComponent(id);
        const versionHistory = await modelComponent.updateRebasedVersionHistory(consumer.scope.objects, [modifiedComp]);
        if (versionHistory) consumer.scope.objects.add(versionHistory);
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
  messageTitle?: string
): Promise<Version | undefined> {
  if (divergeData.isDiverged()) {
    throw new BitError(`unable to squash because ${id.toString()} is diverged in history.
consider switching to "${
      otherLaneId.name
    }" first, merging "${currentLaneName}", then switching back to "${currentLaneName}" and merging "${
      otherLaneId.name
    }"
alternatively, use "--no-squash" flag to keep the entire history of "${otherLaneId.name}"`);
  }
  if (divergeData.isSourceAhead()) {
    // nothing to do. current is ahead, nothing to merge. (it was probably filtered out already as a "failedComponent")
    return undefined;
  }
  if (!divergeData.isTargetAhead()) {
    // nothing to do. current and remote are the same, nothing to merge. (it was probably filtered out already as a "failedComponent")
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
