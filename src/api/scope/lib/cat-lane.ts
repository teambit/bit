import GeneralError from '../../../error/general-error';
import { loadScope, Scope } from '../../../scope';

export default async function catLane(name: string) {
  const scope: Scope = await loadScope();
  const laneId = await scope.lanes.parseLaneIdFromString(name);
  const lane = await scope.loadLane(laneId);
  if (!lane) throw new GeneralError(`lane ${name} was not found!`);
  const obj = lane.toObject();
  obj.hash = lane.hash().toString();
  return obj;
}
