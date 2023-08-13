import { BitId } from '../../../bit-id';
import { loadScope, Scope } from '../../../scope';
import { VersionHistory } from '../../../scope/models';

export async function catVersionHistory(id: string) {
  const versionHistory = await getVersionHistory(id);
  const versionHistoryObj = versionHistory.toObject();
  versionHistoryObj.hash = versionHistory.hash().toString();
  return versionHistoryObj;
}

export async function generateVersionHistoryGraph(id: string) {
  const versionHistory = await getVersionHistory(id);
  return versionHistory.getGraph();
}

async function getVersionHistory(id: string): Promise<VersionHistory> {
  const scope: Scope = await loadScope();
  const bitId: BitId = await scope.getParsedId(id);
  const component = await scope.getModelComponent(bitId);
  return component.getVersionHistory(scope.objects);
}
