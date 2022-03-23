import { BitError } from '@teambit/bit-error';
import { BitId } from '@teambit/legacy-bit-id';
import { DEFAULT_LANE } from '@teambit/legacy/dist/constants';
import { Consumer } from '@teambit/legacy/dist/consumer';
import { ApplyVersionResults, MergeStrategy } from '@teambit/legacy/dist/consumer/versions-ops/merge-version';
import LaneId, { RemoteLaneId } from '@teambit/legacy/dist/lane-id/lane-id';
import { Lane } from '@teambit/legacy/dist/scope/models';
import { Tmp } from '@teambit/legacy/dist/scope/repositories';
import { MergingMain } from '@teambit/merging';

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
}): Promise<ApplyVersionResults> {
  const currentLaneId = consumer.getCurrentLaneId();
  if (!remoteName && laneName === currentLaneId.name) {
    throw new BitError(`unable to switch to lane "${laneName}", you're already checked out to this lane`);
  }
  const localLaneId = consumer.getCurrentLaneId();
  const localLane = currentLaneId.isDefault() ? null : await consumer.scope.loadLane(localLaneId);
  const laneId = new LaneId({ name: laneName });
  let bitIds: BitId[];
  let otherLane: Lane | null;
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
  const allComponentsStatus = await getAllComponentsStatus();

  return merging.mergeSnaps({
    consumer,
    mergeStrategy,
    allComponentsStatus,
    remoteName,
    laneId,
    localLane,
    noSnap,
    snapMessage,
    build,
  });

  async function getAllComponentsStatus() {
    const tmp = new Tmp(consumer.scope);
    try {
      const componentsStatus = await Promise.all(
        bitIds.map((bitId) =>
          merging.getComponentStatus(consumer, bitId, localLane, otherLaneName, existingOnWorkspaceOnly)
        )
      );
      await tmp.clear();
      return componentsStatus;
    } catch (err: any) {
      await tmp.clear();
      throw err;
    }
  }
}
