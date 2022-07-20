import chalk from 'chalk';
import { BitError } from '@teambit/bit-error';
import { BitId } from '@teambit/legacy-bit-id';
import pMapSeries from 'p-map-series';
import { Consumer } from '@teambit/legacy/dist/consumer';
import { ApplyVersionResults } from '@teambit/legacy/dist/consumer/versions-ops/merge-version';
import { BitIds } from '@teambit/legacy/dist/bit-id';
import { ComponentID } from '@teambit/component-id';
import { Workspace } from '@teambit/workspace';
import { LaneId, DEFAULT_LANE } from '@teambit/lane-id';
import { Lane } from '@teambit/legacy/dist/scope/models';
import { Tmp } from '@teambit/legacy/dist/scope/repositories';
import { MergingMain, ComponentMergeStatus } from '@teambit/merging';
import { remove } from '@teambit/legacy/dist/api/consumer';
import { MergeLaneOptions } from './lanes.main.runtime';

export async function mergeLanes({
  merging,
  workspace,
  laneName,
  mergeStrategy,
  remoteName,
  noSnap,
  snapMessage,
  existingOnWorkspaceOnly,
  build,
  keepReadme,
  squash,
  pattern,
  includeDeps,
}: {
  merging: MergingMain;
  workspace: Workspace;
  laneName: string;
} & MergeLaneOptions): Promise<{ mergeResults: ApplyVersionResults; deleteResults: any }> {
  const consumer = workspace.consumer;
  const currentLaneId = consumer.getCurrentLaneId();
  if (!remoteName && laneName === currentLaneId.name) {
    throw new BitError(
      `unable to merge lane "${laneName}", you're already at this lane. to get updates, simply run "bit checkout head"`
    );
  }
  const parsedLaneId = await consumer.getParsedLaneId(laneName);
  const localLane = currentLaneId.isDefault() ? null : await consumer.scope.loadLane(currentLaneId);
  let bitIds: BitId[];
  let otherLane: Lane | null | undefined;
  let remoteLane;
  let otherLaneName: string;
  const isDefaultLane = laneName === DEFAULT_LANE;

  if (isDefaultLane) {
    if (!localLane) throw new Error(`unable to merge ${DEFAULT_LANE}, the current lane was not found`);
    bitIds = await consumer.scope.getDefaultLaneIdsFromLane(localLane);
    otherLaneName = DEFAULT_LANE;
  } else if (remoteName) {
    const remoteLaneId = LaneId.from(parsedLaneId.name, remoteName);
    remoteLane = await consumer.scope.objects.remoteLanes.getRemoteLane(remoteLaneId);
    if (!remoteLane.length) {
      throw new BitError(
        `unable to switch to "${laneName}" of "${remoteName}", the remote lane was not found or not fetched locally`
      );
    }
    bitIds = await consumer.scope.objects.remoteLanes.getRemoteBitIds(remoteLaneId);
    otherLaneName = `${remoteName}/${parsedLaneId.name}`;
  } else {
    otherLane = await consumer.scope.loadLane(parsedLaneId);
    if (!otherLane) throw new BitError(`unable to switch to "${laneName}", the lane was not found`);
    bitIds = otherLane.components.map((c) => c.id.changeVersion(c.head.toString()));
    otherLaneName = parsedLaneId.name;
  }

  let allComponentsStatus = await getAllComponentsStatus();

  throwForFailures();

  if (pattern) {
    const componentIds = await workspace.resolveMultipleComponentIds(bitIds);
    const compIdsFromPattern = workspace.scope.filterIdsFromPoolIdsByPattern(pattern, componentIds);
    allComponentsStatus = await filterComponentsStatus(
      allComponentsStatus,
      compIdsFromPattern,
      bitIds,
      workspace,
      includeDeps
    );
    bitIds.forEach((bitId) => {
      if (!allComponentsStatus.find((c) => c.id.isEqualWithoutVersion(bitId))) {
        allComponentsStatus.push({ id: bitId, unmergedLegitimately: true, unmergedMessage: `excluded by pattern` });
      }
    });
  }
  if (existingOnWorkspaceOnly) {
    const workspaceIds = await workspace.listIds();
    const compIdsFromPattern = workspaceIds.filter((id) =>
      allComponentsStatus.find((c) => c.id.isEqualWithoutVersion(id._legacy))
    );
    allComponentsStatus = await filterComponentsStatus(
      allComponentsStatus,
      compIdsFromPattern,
      bitIds,
      workspace,
      includeDeps
    );
    bitIds.forEach((bitId) => {
      if (!allComponentsStatus.find((c) => c.id.isEqualWithoutVersion(bitId))) {
        allComponentsStatus.push({ id: bitId, unmergedLegitimately: true, unmergedMessage: `not in the workspace` });
      }
    });
  }

  if (squash) {
    squashSnaps(allComponentsStatus, laneName, consumer);
  }

  const mergeResults = await merging.mergeSnaps({
    mergeStrategy,
    allComponentsStatus,
    remoteName,
    laneId: parsedLaneId,
    localLane,
    noSnap,
    snapMessage,
    build,
  });

  const mergedSuccessfully =
    !mergeResults.failedComponents ||
    mergeResults.failedComponents.length === 0 ||
    mergeResults.failedComponents.every((failedComponent) => failedComponent.unchangedLegitimately);

  let deleteResults = {};

  if (!keepReadme && otherLane && otherLane.readmeComponent && mergedSuccessfully) {
    await consumer.bitMap.syncWithLanes(consumer.bitMap.workspaceLane);

    const readmeComponentId = [
      otherLane.readmeComponent.id.changeVersion(otherLane.readmeComponent?.head?.hash).toString(),
    ];

    deleteResults = await remove({
      ids: readmeComponentId,
      force: false,
      remote: false,
      track: false,
      deleteFiles: true,
    });
  } else if (otherLane && !otherLane.readmeComponent) {
    deleteResults = { readmeResult: `lane ${otherLane.name} doesn't have a readme component` };
  }

  return { mergeResults, deleteResults };

  async function getAllComponentsStatus(): Promise<ComponentMergeStatus[]> {
    const tmp = new Tmp(consumer.scope);
    try {
      const componentsStatus = await Promise.all(
        bitIds.map((bitId) => merging.getComponentMergeStatus(bitId, localLane, otherLaneName))
      );
      await tmp.clear();
      return componentsStatus;
    } catch (err: any) {
      await tmp.clear();
      throw err;
    }
  }

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

async function filterComponentsStatus(
  allComponentsStatus: ComponentMergeStatus[],
  compIdsToKeep: ComponentID[],
  allBitIds: BitId[],
  workspace: Workspace,
  includeDeps = false
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
    await pMapSeries(remoteVersions, async (localVersion) => {
      const versionObj = await modelComponent.loadVersion(localVersion.toString(), workspace.consumer.scope.objects);
      const flattenedDeps = versionObj.getAllFlattenedDependencies();
      const depsNotIncludeInPattern = bitIdsNotFromPattern.filter((id) => flattenedDeps.hasWithoutVersion(id));
      if (!depsNotIncludeInPattern.length) {
        return;
      }
      if (!includeDeps) {
        throw new BitError(`unable to merge ${compId.toString()}.
it has the following dependencies which were not included in the pattern. consider adding "--include-deps" flag
${depsNotIncludeInPattern.map((d) => d.toString()).join('\n')}`);
      }
      depsToAdd.push(...depsNotIncludeInPattern);
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

function squashSnaps(allComponentsStatus: ComponentMergeStatus[], laneName: string, consumer: Consumer) {
  const succeededComponents = allComponentsStatus.filter((c) => !c.unmergedMessage);
  succeededComponents.forEach(({ id, divergeData, componentFromModel }) => {
    if (!divergeData) {
      throw new Error(`unable to squash. divergeData is missing from ${id.toString()}`);
    }
    if (divergeData.isDiverged()) {
      throw new BitError(`unable to squash because ${id.toString()} is diverged in history.
consider switching to ${laneName} first, merging this lane, then switching back to this lane and merging ${laneName}`);
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
    if (remoteSnaps.length === 1) {
      // nothing to squash. it has only one commit.
      return;
    }
    if (!componentFromModel) {
      throw new Error('unable to squash, the componentFromModel is missing');
    }

    // do the squash.
    if (divergeData.commonSnapBeforeDiverge) {
      componentFromModel.addAsOnlyParent(divergeData.commonSnapBeforeDiverge);
    } else {
      // there is no commonSnapBeforeDiverge. the local has no snaps, all are remote, no need for parents. keep only head.
      componentFromModel.parents.forEach((ref) => componentFromModel.removeParent(ref));
    }
    const squashedSnaps = remoteSnaps.filter((snap) => !snap.isEqual(componentFromModel.hash()));
    componentFromModel.setSquashed(squashedSnaps);
    consumer.scope.objects.add(componentFromModel);
  });
}
