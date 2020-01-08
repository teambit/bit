import { Consumer, loadConsumer } from '../../../consumer';
import { BitId } from '../../../bit-id';
import { DEFAULT_LANE, LANE_REMOTE_DELIMITER } from '../../../constants';
import { Lane } from '../../../scope/models';
import { filterAsync } from '../../../utils';
import LaneId from '../../../lane-id/lane-id';
import GeneralError from '../../../error/general-error';

export type LaneData = { name: string; components: Array<{ id: BitId; head: string }>; remote: string | null };

export type LaneResults = {
  merged?: string[];
  notMerged?: string[];
  lanes?: LaneData[];
  currentLane?: string;
};

export default async function lane({
  name,
  merged,
  showDefaultLane,
  notMerged
}: {
  name: string;
  merged: boolean;
  showDefaultLane: boolean;
  notMerged: boolean;
}): Promise<LaneResults> {
  const consumer: Consumer = await loadConsumer();
  if (name) {
    const laneObject = await consumer.scope.loadLane(LaneId.from(name));
    // @todo: what about master?
    if (!laneObject) throw new GeneralError(`lane "${name}" was not found`);
    return { lanes: [getLaneDataOfLane(laneObject)] };
  }
  const currentLane = consumer.getCurrentLaneId();
  const currentLaneStr = currentLane.toString();
  const lanesObjects = await consumer.scope.listLanes();
  if (merged) {
    const mergedLanes: Lane[] = await filterAsync(lanesObjects, (laneObj: Lane) =>
      laneObj.isFullyMerged(consumer.scope).then(result => result)
    );
    return { merged: mergedLanes.map(l => l.name) };
  }
  if (notMerged) {
    const unmergedLanes: Lane[] = await filterAsync(lanesObjects, (laneObj: Lane) =>
      laneObj.isFullyMerged(consumer.scope).then(result => !result)
    );
    return { notMerged: unmergedLanes.map(l => l.name) };
  }
  const lanes: LaneData[] = lanesObjects.map((laneObject: Lane) => getLaneDataOfLane(laneObject));

  if (showDefaultLane) {
    lanes.push(getLaneDataOfDefaultLane());
  }

  return { lanes, currentLane: currentLaneStr };

  function getLaneDataOfLane(laneObject: Lane): LaneData {
    const laneName = laneObject.toLaneId().toString();
    const trackingData = consumer.scope.getRemoteTrackedDataByLocalLane(laneName);
    return {
      name: laneName,
      remote: trackingData ? `${trackingData.remoteScope}${LANE_REMOTE_DELIMITER}${trackingData.remoteLane}` : null,
      components: laneObject.components.map(c => ({ id: c.id, head: c.head.toString() }))
    };
  }

  function getLaneDataOfDefaultLane(): LaneData {
    const bitIds = consumer.bitMap.getAuthoredAndImportedBitIdsOfDefaultLane();
    return {
      name: DEFAULT_LANE,
      remote: null,
      components: bitIds.map(bitId => ({ id: bitId, head: bitId.version as string }))
    };
  }
}
