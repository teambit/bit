import GeneralError from '../../../error/general-error';
import LaneId from '../../../lane-id/lane-id';
import { loadScope, Scope } from '../../../scope';

export default async function catLane(name: string) {
  const scope: Scope = await loadScope();
  const laneId = new LaneId({ name });
  const lane = await scope.loadLane(laneId);
  // @todo: throw LaneNotFound
  if (!lane) throw new GeneralError(`lane ${name} was not found!`);
  return lane.toObject();
}
