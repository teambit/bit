import { BitIds } from '../bit-id';
import { Workspace } from '../workspace';

// what to address?
// bare scope extension execution
// consumer extension
export default async function loadExtensions(workspace: Workspace) {
  const ids = BitIds.deserialize(['bit.envs/compilers/typescript']);
  const components = await workspace.scope.import(ids);
  return components;
}
