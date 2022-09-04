import { BitError } from '@teambit/bit-error';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { LanesAspect, LanesMain } from '@teambit/lanes';
import MergingAspect, { MergingMain, ComponentMergeStatus } from '@teambit/merging';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import chalk from 'chalk';
import { BitId } from '@teambit/legacy-bit-id';
import pMapSeries from 'p-map-series';
import { Consumer } from '@teambit/legacy/dist/consumer';
import { MergeStrategy, ApplyVersionResults } from '@teambit/legacy/dist/consumer/versions-ops/merge-version';
import { BitIds } from '@teambit/legacy/dist/bit-id';
import { ComponentID } from '@teambit/component-id';
import { DEFAULT_LANE, LaneId } from '@teambit/lane-id';
import { Lane } from '@teambit/legacy/dist/scope/models';
import { Tmp } from '@teambit/legacy/dist/scope/repositories';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { RemoveAspect, RemoveMain } from '@teambit/remove';
import { MergeLanesAspect } from './merge-lanes.aspect';
import { MergeLaneCmd } from './merge-lane.cmd';

export type MergeLaneOptions = {
  mergeStrategy: MergeStrategy;
  noSnap: boolean;
  snapMessage: string;
  existingOnWorkspaceOnly: boolean;
  build: boolean;
  keepReadme: boolean;
  noSquash: boolean;
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
    private remove: RemoveMain
  ) {}

  async mergeLane(
    laneName: string,
    options: MergeLaneOptions
  ): Promise<{ mergeResults: ApplyVersionResults; deleteResults: any }> {
    if (!this.workspace) {
      throw new BitError(`unable to merge a lane outside of Bit workspace`);
    }
    const consumer = this.workspace.consumer;

    const {
      mergeStrategy,
      noSnap,
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
    const otherLaneName = isDefaultLane ? DEFAULT_LANE : otherLaneId.toString();

    const getAllComponentsStatus = async (): Promise<ComponentMergeStatus[]> => {
      const tmp = new Tmp(consumer.scope);
      try {
        const componentsStatus = await Promise.all(
          bitIds.map((bitId) =>
            this.merging.getComponentMergeStatus(bitId, currentLane, otherLaneName, {
              resolveUnrelated,
              ignoreConfigChanges,
            })
          )
        );
        await tmp.clear();
        return componentsStatus;
      } catch (err: any) {
        await tmp.clear();
        throw err;
      }
    };
    let allComponentsStatus = await getAllComponentsStatus();

    if (pattern) {
      const componentIds = await this.workspace.resolveMultipleComponentIds(bitIds);
      const compIdsFromPattern = this.workspace.scope.filterIdsFromPoolIdsByPattern(pattern, componentIds);
      allComponentsStatus = await filterComponentsStatus(
        allComponentsStatus,
        compIdsFromPattern,
        bitIds,
        this.workspace,
        includeDeps,
        otherLane || undefined
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
        includeDeps
      );
      bitIds.forEach((bitId) => {
        if (!allComponentsStatus.find((c) => c.id.isEqualWithoutVersion(bitId))) {
          allComponentsStatus.push({ id: bitId, unmergedLegitimately: true, unmergedMessage: `not in the workspace` });
        }
      });
    }

    throwForFailures();

    if (currentLaneId.isDefault() && !noSquash) {
      squashSnaps(allComponentsStatus, otherLaneId, consumer);
    }

    const mergeResults = await this.merging.mergeSnaps({
      mergeStrategy,
      allComponentsStatus,
      laneId: otherLaneId,
      localLane: currentLane,
      noSnap,
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
      });
    } else if (otherLane && !otherLane.readmeComponent) {
      deleteResults = { readmeResult: `\nlane ${otherLane.name} doesn't have a readme component` };
    }

    await this.workspace.consumer.onDestroy();

    return { mergeResults, deleteResults };

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

  static slots = [];
  static dependencies = [LanesAspect, CLIAspect, WorkspaceAspect, MergingAspect, LoggerAspect, RemoveAspect];
  static runtime = MainRuntime;

  static async provider([lanes, cli, workspace, merging, loggerMain, remove]: [
    LanesMain,
    CLIMain,
    Workspace,
    MergingMain,
    LoggerMain,
    RemoveMain
  ]) {
    const logger = loggerMain.createLogger(MergeLanesAspect.id);
    const lanesCommand = cli.getCommand('lane');
    const mergeLanesMain = new MergeLanesMain(workspace, merging, lanes, logger, remove);
    lanesCommand?.commands?.push(new MergeLaneCmd(mergeLanesMain));
    return mergeLanesMain;
  }
}

async function filterComponentsStatus(
  allComponentsStatus: ComponentMergeStatus[],
  compIdsToKeep: ComponentID[],
  allBitIds: BitId[],
  workspace: Workspace,
  includeDeps = false,
  lane?: Lane
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
    const { divergeData } = fromStatus;
    if (!divergeData) {
      throw new Error(`filterComponentsStatus: unable to find divergeData for ${compId.toString()}`);
    }
    const remoteVersions = divergeData.snapsOnRemoteOnly;
    if (!remoteVersions.length) {
      return;
    }
    const modelComponent = await workspace.consumer.scope.getModelComponent(compId._legacy);
    // optimization suggestion: if squash is given, check only the last version.
    const laneIds = lane?.toBitIds();
    await pMapSeries(remoteVersions, async (remoteVersion) => {
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
          const isOnLane = await workspace.consumer.scope.isIdOnLane(dep, lane, laneIds);
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

function squashSnaps(allComponentsStatus: ComponentMergeStatus[], otherLaneId: LaneId, consumer: Consumer) {
  const currentLaneName = consumer.getCurrentLaneId().name;
  const succeededComponents = allComponentsStatus.filter((c) => !c.unmergedMessage);
  succeededComponents.forEach(({ id, divergeData, componentFromModel }) => {
    if (!divergeData) {
      throw new Error(`unable to squash. divergeData is missing from ${id.toString()}`);
    }
    if (divergeData.isDiverged()) {
      throw new BitError(`unable to squash because ${id.toString()} is diverged in history.
consider switching to "${
        otherLaneId.name
      }" first, merging "${currentLaneName}", then switching back to "${currentLaneName}" and merging "${
        otherLaneId.name
      }"
alternatively, use "--no-squash" flag to keep the entire history of "${otherLaneId.name}"`);
    }
    if (divergeData.isLocalAhead()) {
      // nothing to do. current is ahead, nothing to merge. (it was probably filtered out already as a "failedComponent")
      return;
    }
    if (!divergeData.isRemoteAhead()) {
      // nothing to do. current and remote are the same, nothing to merge. (it was probably filtered out already as a "failedComponent")
      return;
    }
    // remote is ahead and was not diverge.
    const remoteSnaps = divergeData.snapsOnRemoteOnly;
    if (remoteSnaps.length === 0) {
      throw new Error(`remote is ahead but it has no snaps. it's impossible`);
    }
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
    consumer.scope.objects.add(componentFromModel);
  });
}

MergeLanesAspect.addRuntime(MergeLanesMain);

export default MergeLanesMain;
