import { BitError } from '@teambit/bit-error';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { LanesAspect, LanesMain } from '@teambit/lanes';
import MergingAspect, { MergingMain, ComponentMergeStatus, ConfigMergeResult } from '@teambit/merging';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import chalk from 'chalk';
import { BitId } from '@teambit/legacy-bit-id';
import pMapSeries from 'p-map-series';
import { Consumer } from '@teambit/legacy/dist/consumer';
import { MergeStrategy, ApplyVersionResults } from '@teambit/legacy/dist/consumer/versions-ops/merge-version';
import { BitIds } from '@teambit/legacy/dist/bit-id';
import { ScopeAspect, ScopeMain } from '@teambit/scope';
import ScopeComponentsImporter from '@teambit/legacy/dist/scope/component-ops/scope-components-importer';
import { ComponentID } from '@teambit/component-id';
import { DEFAULT_LANE, LaneId } from '@teambit/lane-id';
import { Lane, Version } from '@teambit/legacy/dist/scope/models';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { SnapsDistance } from '@teambit/legacy/dist/scope/component-ops/snaps-distance';
import { RemoveAspect, RemoveMain } from '@teambit/remove';
import { compact } from 'lodash';
import { ExportAspect, ExportMain } from '@teambit/export';
import { BitObject } from '@teambit/legacy/dist/scope/objects';
import { getDivergeData } from '@teambit/legacy/dist/scope/component-ops/get-diverge-data';
import { MergeLanesAspect } from './merge-lanes.aspect';
import { MergeLaneCmd } from './merge-lane.cmd';
import { MergeLaneFromScopeCmd } from './merge-lane-from-scope.cmd';

export type MergeLaneOptions = {
  mergeStrategy: MergeStrategy;
  noSnap: boolean;
  snapMessage: string;
  existingOnWorkspaceOnly: boolean;
  build: boolean;
  keepReadme: boolean;
  noSquash: boolean;
  tag?: boolean;
  pattern?: string;
  includeDeps?: boolean;
  skipDependencyInstallation?: boolean;
  resolveUnrelated?: MergeStrategy;
  ignoreConfigChanges?: boolean;
  remote?: boolean;
};

export class MergeLanesMain {
  constructor(
    private workspace: Workspace | undefined,
    private merging: MergingMain,
    private lanes: LanesMain,
    private logger: Logger,
    private remove: RemoveMain,
    private scope: ScopeMain,
    private exporter: ExportMain
  ) {}

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
      noSquash,
      pattern,
      includeDeps,
      skipDependencyInstallation,
      resolveUnrelated,
      ignoreConfigChanges,
      remote,
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
    const currentLane = currentLaneId.isDefault() ? null : await consumer.scope.loadLane(currentLaneId);
    const isDefaultLane = otherLaneId.isDefault();
    const getOtherLane = async () => {
      if (isDefaultLane) {
        return undefined;
      }
      const lane = await consumer.scope.loadLane(otherLaneId);
      if (remote || !lane) {
        return this.lanes.fetchLaneWithItsComponents(otherLaneId);
      }
      return lane;
    };
    const otherLane = await getOtherLane();
    const getBitIds = async () => {
      if (isDefaultLane) {
        if (!currentLane) throw new Error(`unable to merge ${DEFAULT_LANE}, the current lane was not found`);
        return consumer.scope.getDefaultLaneIdsFromLane(currentLane);
      }
      if (!otherLane) throw new Error(`lane must be defined for non-default`);
      return otherLane.toBitIds();
    };
    const bitIds = await getBitIds();
    this.logger.debug(`merging the following bitIds: ${bitIds.toString()}`);

    let allComponentsStatus = await this.merging.getMergeStatus(bitIds, currentLane, otherLane, {
      resolveUnrelated,
      ignoreConfigChanges,
    });
    const shouldSquash = currentLaneId.isDefault() && !noSquash;

    if (pattern) {
      const componentIds = await this.workspace.resolveMultipleComponentIds(bitIds);
      const compIdsFromPattern = this.workspace.scope.filterIdsFromPoolIdsByPattern(pattern, componentIds);
      allComponentsStatus = await filterComponentsStatus(
        allComponentsStatus,
        compIdsFromPattern,
        bitIds,
        this.workspace,
        includeDeps,
        otherLane || undefined,
        shouldSquash
      );
      bitIds.forEach((bitId) => {
        if (!allComponentsStatus.find((c) => c.id.isEqualWithoutVersion(bitId))) {
          allComponentsStatus.push({ id: bitId, unmergedLegitimately: true, unmergedMessage: `excluded by pattern` });
        }
      });
    }
    if (existingOnWorkspaceOnly) {
      const workspaceIds = await this.workspace.listIds();
      const compIdsFromPattern = workspaceIds.filter((id) =>
        allComponentsStatus.find((c) => c.id.isEqualWithoutVersion(id._legacy))
      );
      allComponentsStatus = await filterComponentsStatus(
        allComponentsStatus,
        compIdsFromPattern,
        bitIds,
        this.workspace,
        includeDeps,
        otherLane || undefined,
        shouldSquash
      );
      bitIds.forEach((bitId) => {
        if (!allComponentsStatus.find((c) => c.id.isEqualWithoutVersion(bitId))) {
          allComponentsStatus.push({ id: bitId, unmergedLegitimately: true, unmergedMessage: `not in the workspace` });
        }
      });
    }

    throwForFailures();

    if (shouldSquash) {
      await squashSnaps(allComponentsStatus, otherLaneId, consumer);
    }

    const mergeResults = await this.merging.mergeSnaps({
      mergeStrategy,
      allComponentsStatus,
      laneId: otherLaneId,
      localLane: currentLane,
      noSnap,
      tag,
      snapMessage,
      build,
      skipDependencyInstallation,
    });

    const mergedSuccessfully =
      !mergeResults.failedComponents ||
      mergeResults.failedComponents.length === 0 ||
      mergeResults.failedComponents.every((failedComponent) => failedComponent.unchangedLegitimately);

    let deleteResults = {};

    if (!keepReadme && otherLane && otherLane.readmeComponent && mergedSuccessfully) {
      const readmeComponentId = otherLane.readmeComponent.id
        .changeVersion(otherLane.readmeComponent?.head?.hash)
        .toString();

      deleteResults = await this.remove.remove({
        componentsPattern: readmeComponentId,
        force: false,
        remote: false,
        track: false,
        deleteFiles: true,
        fromLane: false,
      });
    } else if (otherLane && !otherLane.readmeComponent) {
      deleteResults = { readmeResult: `\nlane ${otherLane.name} doesn't have a readme component` };
    }
    const configMergeResults = allComponentsStatus.map((c) => c.configMergeResult);

    await this.workspace.consumer.onDestroy();

    return { mergeResults, deleteResults, configMergeResults: compact(configMergeResults) };

    function throwForFailures() {
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
    }
  }

  async mergeFromScope(
    laneName: string,
    options: Partial<MergeLaneOptions> & { push?: boolean }
  ): Promise<{
    mergedPreviously: string[];
    mergedNow: string[];
    exportedIds: string[];
  }> {
    if (this.workspace)
      throw new BitError(
        `unable to run this command from a workspace, please create a new bare-scope and run it from there`
      );
    const laneId = LaneId.parse(laneName);
    const lane = await this.lanes.importLaneObject(laneId);
    const laneIds = lane.toBitIds();
    const getIdsToMerge = async (): Promise<BitIds> => {
      if (!options.pattern) return laneIds;
      const laneCompIds = await this.scope.resolveMultipleComponentIds(laneIds);
      const ids = this.scope.filterIdsFromPoolIdsByPattern(options.pattern, laneCompIds);
      return BitIds.fromArray(ids.map((id) => id._legacy));
    };
    const idsToMerge = await getIdsToMerge();
    const scopeComponentsImporter = ScopeComponentsImporter.getInstance(this.scope.legacyScope);
    await scopeComponentsImporter.importManyDeltaWithoutDeps({
      ids: idsToMerge,
      fromHead: true,
      lane,
      ignoreMissingHead: true,
    });
    // get their main as well
    await scopeComponentsImporter.importManyDeltaWithoutDeps({
      ids: idsToMerge.toVersionLatest(),
      fromHead: true,
      ignoreMissingHead: true,
    });
    const repo = this.scope.legacyScope.objects;
    // loop through all components, make sure they're all ahead of main (it might not be on main yet).
    // then, change the version object to include an extra parent to point to the main.
    // then, change the component object head to point to this changed version
    const mergedPreviously: BitId[] = [];
    const mergedNow: BitId[] = [];
    const bitObjectsPerComp = await pMapSeries(idsToMerge, async (id) => {
      const modelComponent = await this.scope.legacyScope.getModelComponent(id);
      const versionObj = await modelComponent.loadVersion(id.version as string, repo);
      const laneHead = modelComponent.getRef(id.version as string);
      if (!laneHead) throw new Error(`lane head must be defined for ${id.toString()}`);
      const mainHead = modelComponent.head || null;
      if (mainHead?.isEqual(laneHead)) {
        mergedPreviously.push(id);
        return undefined;
      }
      const divergeData = await getDivergeData({
        repo,
        modelComponent,
        sourceHead: mainHead,
        targetHead: laneHead,
      });
      const modifiedVersion = squashOneComp(DEFAULT_LANE, laneId, id, divergeData, versionObj);
      modelComponent.setHead(laneHead);
      const objects = [modelComponent, modifiedVersion];
      mergedNow.push(id);
      return { id, objects };
    });
    const bitObjects = compact(bitObjectsPerComp).map((b) => b.objects);
    await repo.writeObjectsToTheFS(bitObjects.flat() as BitObject[]);
    let exportedIds: string[] = [];
    if (options.push) {
      const ids = compact(bitObjectsPerComp).map((b) => b.id);
      const bitIds = BitIds.fromArray(ids);
      const { exported } = await this.exporter.exportMany({
        scope: this.scope.legacyScope,
        ids: bitIds,
        idsWithFutureScope: bitIds,
        allVersions: false,
        // no need to export anything else other than the head. the normal calculation of what to export won't apply here
        // as it is done from the scope.
        exportHeadsOnly: true,
      });
      exportedIds = exported.map((id) => id.toString());
    }

    return {
      mergedPreviously: mergedPreviously.map((id) => id.toString()),
      mergedNow: mergedNow.map((id) => id.toString()),
      exportedIds,
    };
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
  ];
  static runtime = MainRuntime;

  static async provider([lanes, cli, workspace, merging, loggerMain, remove, scope, exporter]: [
    LanesMain,
    CLIMain,
    Workspace,
    MergingMain,
    LoggerMain,
    RemoveMain,
    ScopeMain,
    ExportMain
  ]) {
    const logger = loggerMain.createLogger(MergeLanesAspect.id);
    const lanesCommand = cli.getCommand('lane');
    const mergeLanesMain = new MergeLanesMain(workspace, merging, lanes, logger, remove, scope, exporter);
    lanesCommand?.commands?.push(new MergeLaneCmd(mergeLanesMain));
    cli.register(new MergeLaneFromScopeCmd(mergeLanesMain));
    return mergeLanesMain;
  }
}

async function filterComponentsStatus(
  allComponentsStatus: ComponentMergeStatus[],
  compIdsToKeep: ComponentID[],
  allBitIds: BitId[],
  workspace: Workspace,
  includeDeps = false,
  otherLane?: Lane, // lane that gets merged into the current lane. if not provided, it's main that gets merged into the current lane
  shouldSquash?: boolean
): Promise<ComponentMergeStatus[]> {
  const bitIdsFromPattern = BitIds.fromArray(compIdsToKeep.map((c) => c._legacy));
  const bitIdsNotFromPattern = allBitIds.filter((bitId) => !bitIdsFromPattern.hasWithoutVersion(bitId));
  const filteredComponentStatus: ComponentMergeStatus[] = [];
  const depsToAdd: BitId[] = [];
  await pMapSeries(compIdsToKeep, async (compId) => {
    const fromStatus = allComponentsStatus.find((c) => c.id.isEqualWithoutVersion(compId._legacy));
    if (!fromStatus) {
      throw new Error(`filterComponentsStatus: unable to find ${compId.toString()} in component-status`);
    }
    filteredComponentStatus.push(fromStatus);
    if (fromStatus.unmergedMessage) {
      return;
    }
    if (!otherLane) {
      // if merging main, no need to check whether the deps are included in the pattern.
      return;
    }
    const { divergeData } = fromStatus;
    if (!divergeData) {
      throw new Error(`filterComponentsStatus: unable to find divergeData for ${compId.toString()}`);
    }
    let targetVersions = divergeData.snapsOnTargetOnly;
    if (!targetVersions.length) {
      return;
    }
    const modelComponent = await workspace.consumer.scope.getModelComponent(compId._legacy);
    if (shouldSquash) {
      // no need to check all versions, we merge only the head
      const headOnTarget = otherLane ? otherLane.getComponent(compId._legacy)?.head : modelComponent.head;
      if (!headOnTarget) {
        throw new Error(`filterComponentsStatus: unable to find head for ${compId.toString()}`);
      }
      targetVersions = [headOnTarget];
    }

    await pMapSeries(targetVersions, async (remoteVersion) => {
      const versionObj = await modelComponent.loadVersion(remoteVersion.toString(), workspace.consumer.scope.objects);
      const flattenedDeps = versionObj.getAllFlattenedDependencies();
      const depsNotIncludeInPattern = flattenedDeps.filter((id) =>
        bitIdsNotFromPattern.find((bitId) => bitId.isEqualWithoutVersion(id))
      );
      if (!depsNotIncludeInPattern.length) {
        return;
      }
      const depsOnLane: BitId[] = [];
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
      if (!includeDeps) {
        throw new BitError(`unable to merge ${compId.toString()}.
it has (in version ${remoteVersion.toString()}) the following dependencies which were not included in the pattern. consider adding "--include-deps" flag
${depsOnLane.map((d) => d.toString()).join('\n')}`);
      }
      depsToAdd.push(...depsOnLane);
    });
  });
  if (depsToAdd.length) {
    const depsUniq = BitIds.uniqFromArray(depsToAdd);
    depsUniq.forEach((id) => {
      const fromStatus = allComponentsStatus.find((c) => c.id.isEqualWithoutVersion(id));
      if (!fromStatus) {
        throw new Error(`filterComponentsStatus: unable to find ${id.toString()} in component-status`);
      }
      filteredComponentStatus.push(fromStatus);
    });
  }
  return filteredComponentStatus;
}

async function squashSnaps(allComponentsStatus: ComponentMergeStatus[], otherLaneId: LaneId, consumer: Consumer) {
  const currentLaneName = consumer.getCurrentLaneId().name;
  const succeededComponents = allComponentsStatus.filter((c) => !c.unmergedMessage);
  await Promise.all(
    succeededComponents.map(async ({ id, divergeData, componentFromModel }) => {
      if (!divergeData) {
        throw new Error(`unable to squash. divergeData is missing from ${id.toString()}`);
      }
      const modifiedComp = squashOneComp(currentLaneName, otherLaneId, id, divergeData, componentFromModel);
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
function squashOneComp(
  currentLaneName: string,
  otherLaneId: LaneId,
  id: BitId,
  divergeData: SnapsDistance,
  componentFromModel?: Version
): Version | undefined {
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
  // no need to check this case. even if it has only one snap ahead, we want to do the "squash", and run "addAsOnlyParent"
  // to make sure it doesn't not have two parents.
  // if (remoteSnaps.length === 1) {
  //   // nothing to squash. it has only one commit.
  //   return;
  // }
  if (!componentFromModel) {
    throw new Error('unable to squash, the componentFromModel is missing');
  }

  const currentParents = componentFromModel.parents;

  // do the squash.
  if (divergeData.commonSnapBeforeDiverge) {
    componentFromModel.addAsOnlyParent(divergeData.commonSnapBeforeDiverge);
  } else {
    // there is no commonSnapBeforeDiverge. the local has no snaps, all are remote, no need for parents. keep only head.
    componentFromModel.parents.forEach((ref) => componentFromModel.removeParent(ref));
  }
  componentFromModel.setSquashed({ previousParents: currentParents, laneId: otherLaneId });
  return componentFromModel;
}

MergeLanesAspect.addRuntime(MergeLanesMain);

export default MergeLanesMain;
