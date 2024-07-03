import { BitError } from '@teambit/bit-error';
import { loadScope, Scope } from '@teambit/legacy/dist/scope';

export async function catLane(name: string) {
  const scope: Scope = await loadScope();
  const laneId = await scope.lanes.parseLaneIdFromString(name);
  const lane = await scope.loadLane(laneId);
  if (!lane) throw new BitError(`lane ${name} was not found!`);
  const obj = lane.toObject();
  obj.hash = lane.hash().toString();
  return obj;
}
