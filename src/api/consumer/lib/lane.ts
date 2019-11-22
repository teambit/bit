import { Consumer, loadConsumer } from '../../../consumer';
import { BitId } from '../../../bit-id';
import { DEFAULT_LANE } from '../../../constants';

export type LaneResults = {
  added?: string;
  lanes?: string[];
  lanesWithComponents?: { [lane: string]: { id: BitId; head: string } };
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
    consumer.bitMap.addLane(name);
    results = { added: name };
  } else {
    const currentLane = consumer.getCurrentLane();
    const currentLaneStr = currentLane.toString();
    if (components) {
      const componentsGrouped = await consumer.scope.listGroupedByLanes();
      const lanesWithComponents = Object.keys(componentsGrouped).reduce((acc, current) => {
        acc[current] = componentsGrouped[current].map(c => ({ id: c.toBitId(), head: c.latest() }));
        return acc;
      }, {});
      if (!lanesWithComponents[currentLaneStr]) lanesWithComponents[currentLaneStr] = [];
      results = { lanesWithComponents };
    } else {
      // show lanes
      const lanesObjects = await consumer.scope.listLanes();
      const lanes = lanesObjects.map(l => l.id());
      if (!lanes.includes(currentLaneStr)) lanes.push(currentLaneStr);
      results = { lanes };
    }
    results.currentLane = currentLaneStr;
  }
  await consumer.onDestroy();
  return results;
}
