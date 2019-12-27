import { Consumer, loadConsumer } from '../../../consumer';
import { BitId } from '../../../bit-id';
import { DEFAULT_LANE } from '../../../constants';
import { Lane } from '../../../scope/models';
import { filterAsync } from '../../../utils';

export type LaneResults = {
  added?: string;
  lanes?: string[];
  merged?: string[];
  notMerged?: string[];
  lanesWithComponents?: { [lane: string]: Array<{ id: BitId; head: string }> };
  currentLane?: string;
};

export default async function lane({
  name,
  components,
  remove,
  merged,
  notMerged
}: {
  name: string;
  components: boolean;
  remove: boolean;
  merged: boolean;
  notMerged: boolean;
}): Promise<LaneResults> {
  const consumer: Consumer = await loadConsumer();
  let results: LaneResults;
  if (name) {
    await consumer.scope.addLane(name);
    results = { added: name };
  } else {
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
    if (components) {
      const lanesWithComponents = lanesObjects.reduce((acc, current: Lane) => {
        acc[current.toLaneId().toString()] = current.components.map(c => ({ id: c.id, head: c.head.toString() }));
        return acc;
      }, {});
      if (!currentLane.isDefault() && !lanesWithComponents[currentLaneStr]) {
        lanesWithComponents[currentLaneStr] = [];
      }
      const masterComponents = await consumer.scope.list();
      lanesWithComponents[DEFAULT_LANE] = masterComponents
        .filter(c => !c.isEmpty())
        .map(c => ({ id: c.toBitId(), head: c.latest() }));
      results = { lanesWithComponents };
    } else {
      // show lanes
      const lanes = lanesObjects.map(l => l.id());
      if (!currentLane.isDefault() && !lanes.includes(currentLaneStr)) lanes.push(currentLaneStr);
      lanes.push(DEFAULT_LANE);
      results = { lanes };
    }
    results.currentLane = currentLaneStr;
  }
  await consumer.onDestroy();
  return results;
}
