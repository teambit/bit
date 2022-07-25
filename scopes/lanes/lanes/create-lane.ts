import { BitError } from '@teambit/bit-error';
import { Consumer } from '@teambit/legacy/dist/consumer';
// import { BitIds } from '@teambit/legacy/dist/bit-id';
import Lane, { LaneComponent } from '@teambit/legacy/dist/scope/models/lane';

export async function createLane(
  consumer: Consumer,
  laneName: string,
  scopeName: string,
  remoteLane?: Lane
): Promise<Lane> {
  const lanes = await consumer.scope.listLanes();
  if (lanes.find((lane) => lane.name === laneName)) {
    throw new BitError(`lane "${laneName}" already exists, to switch to this lane, please use "bit switch" command`);
  }
  throwForInvalidLaneName(laneName);
  const getDataToPopulateLaneObjectIfNeeded = async (): Promise<LaneComponent[]> => {
    if (remoteLane) return remoteLane.components;
    // when branching from one lane to another, copy components from the origin lane
    // when branching from main, no need to copy anything
    const currentLaneObject = await consumer.getCurrentLaneObject();
    return currentLaneObject ? currentLaneObject.components : [];
  };
  const forkedFrom = consumer.bitMap.laneId;
  const newLane = remoteLane
    ? Lane.from({
        name: laneName,
        hash: remoteLane.hash().toString(),
        log: remoteLane.log,
        scope: remoteLane.scope,
        forkedFrom,
      })
    : Lane.create(laneName, scopeName, forkedFrom);
  const dataToPopulate = await getDataToPopulateLaneObjectIfNeeded();
  newLane.setLaneComponents(dataToPopulate);

  await consumer.scope.lanes.saveLane(newLane);

  return newLane;
}

export function throwForInvalidLaneName(laneName: string) {
  if (!isValidLaneName(laneName)) {
    throw new BitError(
      `lane "${laneName}" has invalid characters. lane name can only contain alphanumeric, lowercase characters, and the following ["-", "_", "$", "!"]`
    );
  }
}

function isValidLaneName(val: unknown): boolean {
  if (typeof val !== 'string') return false;
  // @todo: should we allow slash? if so, we should probably replace the lane-delimiter with something else. (maybe ":")
  return /^[$\-_!a-z0-9]+$/.test(val);
}
