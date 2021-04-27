import { Consumer } from '..';
import { BitId } from '../../bit-id';
import GeneralError from '../../error/general-error';
import LaneId, { RemoteLaneId } from '../../lane-id/lane-id';
import { Lane } from '../../scope/models';
import { Tmp } from '../../scope/repositories';
import { ApplyVersionResults, MergeStrategy } from '../versions-ops/merge-version';
import { ComponentStatus, getComponentStatus, merge } from '../versions-ops/merge-version/merge-snaps';

export async function mergeLanes({
  consumer,
  mergeStrategy,
  laneName,
  remoteName,
  noSnap,
  snapMessage,
  existingOnWorkspaceOnly,
  build,
}: {
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
    throw new GeneralError(`unable to switch to lane "${laneName}", you're already checked out to this lane`);
  }
  const localLaneId = consumer.getCurrentLaneId();
  const localLane = currentLaneId.isDefault() ? null : await consumer.scope.loadLane(localLaneId);
  const laneId = new LaneId({ name: laneName });
  let bitIds: BitId[];
  let otherLane: Lane | null;
  let remoteLane;
  let otherLaneName: string;
  if (remoteName) {
    const remoteLaneId = RemoteLaneId.from(laneId.name, remoteName);
    remoteLane = await consumer.scope.objects.remoteLanes.getRemoteLane(remoteLaneId);
    if (!remoteLane.length) {
      throw new GeneralError(
        `unable to switch to "${laneName}" of "${remoteName}", the remote lane was not found or not fetched locally`
      );
    }
    bitIds = await consumer.scope.objects.remoteLanes.getRemoteBitIds(remoteLaneId);
    otherLaneName = `${remoteName}/${laneId.name}`;
  } else {
    otherLane = await consumer.scope.loadLane(laneId);
    if (!otherLane) throw new GeneralError(`unable to switch to "${laneName}", the lane was not found`);
    bitIds = otherLane.components.map((c) => c.id.changeVersion(c.head.toString()));
    otherLaneName = laneId.name;
  }
  const allComponentsStatus = await getAllComponentsStatus();

  return merge({
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

  async function getAllComponentsStatus(): Promise<ComponentStatus[]> {
    const tmp = new Tmp(consumer.scope);
    try {
      const componentsStatus = await Promise.all(
        bitIds.map((bitId) => getComponentStatus(consumer, bitId, localLane, otherLaneName, existingOnWorkspaceOnly))
      );
      await tmp.clear();
      return componentsStatus;
    } catch (err) {
      await tmp.clear();
      throw err;
    }
  }
}
