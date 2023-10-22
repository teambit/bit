import { ComponentID } from '@teambit/component-id';
import { loadScope, Scope } from '../../../scope';

export default async function log(path: string, id: string): Promise<string> {
  const scope: Scope = await loadScope(path);
  const bitId = ComponentID.fromString(id);
  const componentLogs = await scope.loadComponentLogs(bitId);
  return JSON.stringify(componentLogs);
}
