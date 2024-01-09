import { BitError } from '@teambit/bit-error';
import { ScopeMain } from '@teambit/scope';
import { Command, CommandOptions } from '@teambit/cli';

export class SnapDistanceCmd implements Command {
  name = 'snap-distance <component-id> [source-snap] [target-snap]';
  description = 'show common-snap and distance between two given snaps or between local and remote snaps';
  extendedDescription = `in case source and target snaps are not provided, the command will use the local and remote heads.
by "head" we mean component-head if on main, or lane-head if on lane.
if source and target snaps are provided, the command will use them to calculate the distance.`;
  alias = '';
  options = [] as CommandOptions;
  loader = true;
  private = true;

  constructor(private scope: ScopeMain) {}

  async report([id, sourceSnap, targetSnap]: [string, string, string]) {
    const compId = await this.scope.resolveComponentId(id);
    const getSnapDistance = async () => {
      if (!sourceSnap) return this.scope.getSnapDistance(compId, false);
      if (!targetSnap) throw new BitError('either provide both source and target snaps or none');
      return this.scope.getSnapsDistanceBetweenTwoSnaps(compId, sourceSnap, targetSnap, false);
    };
    const snapDistance = await getSnapDistance();
    return JSON.stringify(snapDistance, null, 2);
  }
}
