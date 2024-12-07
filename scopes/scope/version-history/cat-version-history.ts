import { loadScope, Scope } from '@teambit/legacy.scope';
import { VersionHistory } from '@teambit/scope.objects';

export async function catVersionHistory(id: string) {
  const versionHistory = await getVersionHistory(id);
  const versionHistoryObj = versionHistory.toObject();
  versionHistoryObj.hash = versionHistory.hash().toString();
  return versionHistoryObj;
}

export async function generateVersionHistoryGraph(id: string, shortHash?: boolean) {
  const scope: Scope = await loadScope();
  const compId = await scope.getParsedId(id);
  const component = await scope.getModelComponent(compId);
  const versionHistory = await component.getVersionHistory(scope.objects);
  const lanePerRef = await scope.objects.remoteLanes.getRefsPerLaneId(compId);
  if (component.head) {
    lanePerRef.main = component.head;
  }
  // convert to hash per lane
  const laneHeads: { [hash: string]: string[] } = {};
  Object.keys(lanePerRef).forEach((lane) => {
    const hash = lanePerRef[lane].toString();
    if (!laneHeads[hash]) laneHeads[hash] = [];
    laneHeads[hash].push(lane);
  });

  return versionHistory.getGraph(component, laneHeads, shortHash);
}

async function getVersionHistory(id: string): Promise<VersionHistory> {
  const scope: Scope = await loadScope();
  const bitId = await scope.getParsedId(id);
  const component = await scope.getModelComponent(bitId);
  const versionHistory = await component.getVersionHistory(scope.objects);
  return versionHistory;
}
