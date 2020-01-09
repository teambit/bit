import { BitIds } from '../bit-id';
import { Workspace } from '../workspace';
import WorkspaceConfig from 'consumer/config/workspace-config';

// what to address?
// bare scope extension execution
// consumer extension
export default async function loadExtensions(workspaceConfig: WorkspaceConfig) {
  const extensionConfig = workspaceConfig.extensions;
  const ids = BitIds.deserializeObsolete(Object.keys(extensionConfig));
  return ids;
  // const components = await workspace.scope.import(ids);
  // return components;
}
