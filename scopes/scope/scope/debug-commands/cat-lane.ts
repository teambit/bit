import { BitError } from '@teambit/bit-error';
import type { Scope } from '@teambit/legacy.scope';
import { loadScope } from '@teambit/legacy.scope';

export async function catLane(name: string): Promise<Record<string, any>> {
  const scope: Scope = await loadScope();
  const laneId = await scope.lanes.parseLaneIdFromString(name);
  const lane = await scope.loadLane(laneId);
  if (!lane) throw new BitError(`lane ${name} was not found!`);
  const obj = lane.toObject();
  obj.hash = lane.hash().toString();
  return obj;
}
