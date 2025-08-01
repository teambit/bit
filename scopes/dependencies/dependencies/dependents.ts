import type { ComponentID } from '@teambit/component-id';
import { BitError } from '@teambit/bit-error';
import type { DependenciesInfo } from '@teambit/legacy.dependency-graph';
import { DependencyGraph } from '@teambit/legacy.dependency-graph';
import type { Workspace } from '@teambit/workspace';

export type DependentsResults = {
  scopeDependents: DependenciesInfo[];
  workspaceDependents: DependenciesInfo[];
  id: ComponentID;
};

export async function dependents(id: string, workspace: Workspace): Promise<DependentsResults> {
  throwForNewComponent(id, workspace);
  const bitId = await workspace.resolveComponentId(id);
  const scopeDependencyGraph = await DependencyGraph.loadLatest(workspace.consumer.scope);
  const scopeDependents = scopeDependencyGraph.getDependentsInfo(bitId);
  const workspaceGraph = await DependencyGraph.buildGraphFromWorkspace(workspace);
  const workspaceDependencyGraph = new DependencyGraph(workspaceGraph);
  const workspaceDependents = workspaceDependencyGraph.getDependentsInfo(bitId);
  return { scopeDependents, workspaceDependents, id: bitId };
}

function throwForNewComponent(id: string, workspace: Workspace) {
  const bitId = workspace.consumer.bitMap.getExistingBitId(id, false);
  if (!bitId) return;
  if (!bitId._legacy.hasScope()) {
    throw new BitError(`${id} is a new component, there is no data about it in the scope`);
  }
}
