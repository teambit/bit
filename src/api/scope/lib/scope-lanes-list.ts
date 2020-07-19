import { loadScope } from '../../../scope';
import { LaneData } from '../../../scope/lanes/lanes';

export default function lanesList(path: string, laneName?: string, mergeData?: boolean): Promise<LaneData[]> {
  return loadScope(path).then((scope) => scope.lanes.getLanesData(scope, laneName, mergeData));
}
