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
    const currentLane = consumer.getCurrentLane() || DEFAULT_LANE;
    if (components) {
      const componentsGrouped = await consumer.scope.listGroupedByLanes();
      const lanesWithComponents = Object.keys(componentsGrouped).reduce((acc, current) => {
        acc[current] = componentsGrouped[current].map(c => ({ id: c.toBitId(), head: c.latest() }));
        return acc;
      }, {});
      if (!lanesWithComponents[currentLane]) lanesWithComponents[currentLane] = [];
      results = { lanesWithComponents };
    } else {
      // show lanes
      const lanes = consumer.scope.listLanes();
      if (!lanes.includes(currentLane)) lanes.push(currentLane);
      results = { lanes };
    }
    results.currentLane = currentLane;
  }
  await consumer.onDestroy();
  return results;
}
