import { BitId } from '../../../bit-id';
import { loadScope, Scope } from '../../../scope';

export default async function log(path: string, id: string): Promise<string> {
  const scope: Scope = await loadScope(path);
  const bitId = BitId.parse(id, true);
  const componentLogs = await scope.loadComponentLogs(bitId);
  return JSON.stringify(componentLogs);
}
