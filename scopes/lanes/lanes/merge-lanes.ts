import chalk from 'chalk';
import { BitError } from '@teambit/bit-error';
import { BitId } from '@teambit/legacy-bit-id';
import { Consumer } from '@teambit/legacy/dist/consumer';
import { ApplyVersionResults } from '@teambit/legacy/dist/consumer/versions-ops/merge-version';
import { LaneId, DEFAULT_LANE } from '@teambit/lane-id';
import { Lane } from '@teambit/legacy/dist/scope/models';
import { Tmp } from '@teambit/legacy/dist/scope/repositories';
import { MergingMain, ComponentStatus } from '@teambit/merging';
import { remove } from '@teambit/legacy/dist/api/consumer';
import { MergeLaneOptions } from './lanes.main.runtime';

export async function mergeLanes({
  merging,
  consumer,
  laneName,
  mergeStrategy,
  remoteName,
  noSnap,
  snapMessage,
  existingOnWorkspaceOnly,
  build,
  keepReadme,
  squash,
}: {
  merging: MergingMain;
  consumer: Consumer;
  laneName: string;
} & MergeLaneOptions): Promise<{ mergeResults: ApplyVersionResults; deleteResults: any }> {
  const currentLaneId = consumer.getCurrentLaneId();
  if (!remoteName && laneName === currentLaneId.name) {
    throw new BitError(`unable to switch to lane "${laneName}", you're already checked out to this lane`);
  }
  const laneId = await consumer.getParsedLaneId(laneName);
  const localLane = currentLaneId.isDefault() ? null : await consumer.scope.loadLane(currentLaneId);
  let bitIds: BitId[];
  let otherLane: Lane | null | undefined;
  let remoteLane;
  let otherLaneName: string;
  const isDefaultLane = laneName === DEFAULT_LANE;

  if (isDefaultLane) {
    bitIds = consumer.bitMap.getAuthoredAndImportedBitIdsOfDefaultLane().filter((id) => id.hasVersion());
    otherLaneName = DEFAULT_LANE;
  } else if (remoteName) {
    const remoteLaneId = LaneId.from(laneId.name, remoteName);
    remoteLane = await consumer.scope.objects.remoteLanes.getRemoteLane(remoteLaneId);
    if (!remoteLane.length) {
      throw new BitError(
        `unable to switch to "${laneName}" of "${remoteName}", the remote lane was not found or not fetched locally`
      );
    }
    bitIds = await consumer.scope.objects.remoteLanes.getRemoteBitIds(remoteLaneId);
    otherLaneName = `${remoteName}/${laneId.name}`;
  } else {
    otherLane = await consumer.scope.loadLane(laneId);
    if (!otherLane) throw new BitError(`unable to switch to "${laneName}", the lane was not found`);
    bitIds = otherLane.components.map((c) => c.id.changeVersion(c.head.toString()));
    otherLaneName = laneId.name;
  }

  const allComponentsStatus = await getAllComponentsStatus();

  if (squash) {
    squashSnaps(allComponentsStatus, laneName, consumer);
  }

  const mergeResults = await merging.mergeSnaps({
    mergeStrategy,
    allComponentsStatus,
    remoteName,
    laneId,
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

  async function getAllComponentsStatus(): Promise<ComponentStatus[]> {
    const tmp = new Tmp(consumer.scope);
    try {
      const componentsStatus = await Promise.all(
        bitIds.map((bitId) => merging.getComponentMergeStatus(bitId, localLane, otherLaneName, existingOnWorkspaceOnly))
      );
      await tmp.clear();
      return componentsStatus;
    } catch (err: any) {
      await tmp.clear();
      throw err;
    }
  }
}

function squashSnaps(allComponentsStatus: ComponentStatus[], laneName: string, consumer: Consumer) {
  const failedComponents = allComponentsStatus.filter((c) => c.failureMessage && !c.unchangedLegitimately);
  if (failedComponents.length) {
    const failureMsgs = failedComponents
      .map(
        (failedComponent) =>
          `${chalk.bold(failedComponent.id.toString())} - ${chalk.red(failedComponent.failureMessage as string)}`
      )
      .join('\n');
    throw new BitError(`unable to squash due to the following failures:\n${failureMsgs}`);
  }
  const succeededComponents = allComponentsStatus.filter((c) => !c.failureMessage);
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
