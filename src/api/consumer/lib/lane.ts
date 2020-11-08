import { DEFAULT_LANE } from '../../../constants';
import { Consumer, loadConsumer, loadConsumerIfExist } from '../../../consumer';
import { LanesIsDisabled } from '../../../consumer/lanes/exceptions/lanes-is-disabled';
import getRemoteByName from '../../../remotes/get-remote-by-name';
import { LaneData } from '../../../scope/lanes/lanes';

export type LaneResults = {
  lanes: LaneData[];
  currentLane?: string | null;
};

export default async function lane({
  name,
  remote,
  merged,
  showDefaultLane,
  notMerged,
}: {
  name: string;
  remote?: string;
  merged: boolean;
  showDefaultLane: boolean;
  notMerged: boolean;
}): Promise<LaneResults> {
  const showMergeData = Boolean(merged || notMerged);
  if (remote) {
    const consumer = await loadConsumerIfExist();
    if (consumer && consumer.isLegacy) throw new LanesIsDisabled();
    const remoteObj = await getRemoteByName(remote, consumer);
    const lanes = await remoteObj.listLanes(name, showMergeData);
    return { lanes };
  }
  const consumer: Consumer = await loadConsumer();
  if (consumer.isLegacy) throw new LanesIsDisabled();
  const lanes = await consumer.scope.lanes.getLanesData(consumer.scope, name, showMergeData);

  if (showDefaultLane) {
    lanes.push(getLaneDataOfDefaultLane());
  }

  const currentLane = consumer.scope.lanes.getCurrentLaneName();

  return { lanes, currentLane };

  function getLaneDataOfDefaultLane(): LaneData {
    const bitIds = consumer.bitMap.getAuthoredAndImportedBitIdsOfDefaultLane();
    return {
      name: DEFAULT_LANE,
      remote: null,
      components: bitIds.map((bitId) => ({ id: bitId, head: bitId.version as string })),
      isMerged: null,
    };
  }
}
