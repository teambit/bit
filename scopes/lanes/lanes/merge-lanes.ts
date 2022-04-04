import { BitError } from '@teambit/bit-error';
import { BitId } from '@teambit/legacy-bit-id';
import { DEFAULT_LANE } from '@teambit/legacy/dist/constants';
import { Consumer } from '@teambit/legacy/dist/consumer';
import { ApplyVersionResults, MergeStrategy } from '@teambit/legacy/dist/consumer/versions-ops/merge-version';
import LaneId, { RemoteLaneId } from '@teambit/legacy/dist/lane-id/lane-id';
import { Lane } from '@teambit/legacy/dist/scope/models';
import { Tmp } from '@teambit/legacy/dist/scope/repositories';
import { MergingMain } from '@teambit/merging';
import remove from '@teambit/legacy/dist/api/consumer/lib/remove';

export async function mergeLanes({
  merging,
  consumer,
  mergeStrategy,
  laneName,
  remoteName,
  noSnap,
  snapMessage,
  existingOnWorkspaceOnly,
  build,
  deleteReadme,
}: {
  merging: MergingMain;
  consumer: Consumer;
  mergeStrategy: MergeStrategy;
  laneName: string;
  remoteName: string | null;
  noSnap: boolean;
  snapMessage: string;
  existingOnWorkspaceOnly: boolean;
  build: boolean;
  deleteReadme: boolean;
}): Promise<ApplyVersionResults> {
  const currentLaneId = consumer.getCurrentLaneId();
  if (!remoteName && laneName === currentLaneId.name) {
    throw new BitError(`unable to switch to lane "${laneName}", you're already checked out to this lane`);
  }
  const localLaneId = consumer.getCurrentLaneId();
  const localLane = currentLaneId.isDefault() ? null : await consumer.scope.loadLane(localLaneId);
  const laneId = new LaneId({ name: laneName });
  let bitIds: BitId[];
  let otherLane: Lane | null | undefined;
  let remoteLane;
  let otherLaneName: string;
  const isDefaultLane = laneName === DEFAULT_LANE;

  if (isDefaultLane) {
    bitIds = consumer.bitMap.getAuthoredAndImportedBitIdsOfDefaultLane().filter((id) => id.hasVersion());
    otherLaneName = DEFAULT_LANE;
  } else if (remoteName) {
    const remoteLaneId = RemoteLaneId.from(laneId.name, remoteName);
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
  console.log('🚀 ~ file: merge-lanes.ts ~ line 65 ~ bitIds', bitIds);

  const allComponentsStatus = await getAllComponentsStatus();

  const result = await merging.mergeSnaps({
    mergeStrategy,
    allComponentsStatus,
    remoteName,
    laneId,
    localLane,
    noSnap,
    snapMessage,
    build,
  });

  if (
    deleteReadme &&
    otherLane &&
    otherLane.readmeComponent &&
    (result.failedComponents.length === 0 ||
      result.failedComponents.every((failedComponent) => failedComponent.unchangedLegitimately))
  ) {
    console.log('🚀 ~ file: merge-lanes.ts ~ line 89 ~ readmeComponentId', result);
    const readmeComponentId = [
      otherLane.readmeComponent.id.changeVersion(otherLane.readmeComponent?.head?.hash).toString(),
    ];
    otherLane.setReadmeComponent(undefined);
    await consumer.scope.lanes.saveLane(otherLane);
    await remove({
      ids: readmeComponentId,
      force: false,
      remote: false,
      track: false,
      deleteFiles: true,
    });
  }

  return result;

  async function getAllComponentsStatus() {
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
