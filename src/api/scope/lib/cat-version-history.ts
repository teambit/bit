import { BitId } from '../../../bit-id';
import { loadScope, Scope } from '../../../scope';

export async function catVersionHistory(id: string) {
  const scope: Scope = await loadScope();
  const bitId: BitId = await scope.getParsedId(id);
  const component = await scope.getModelComponent(bitId);
  const versionHistory = await component.GetVersionHistory(scope.objects);
  const versionHistoryObj = versionHistory.toObject();
  versionHistoryObj.hash = versionHistory.hash().toString();
  return versionHistoryObj;
}
