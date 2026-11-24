import type { ComponentID } from '@teambit/component-id';
import { BitError } from '@teambit/bit-error';
import type { DependenciesInfo } from '@teambit/legacy.dependency-graph';
import { DependencyGraph } from '@teambit/legacy.dependency-graph';
import type { Workspace } from '@teambit/workspace';
import type { ModelComponent } from '@teambit/objects';
import type { ConsumerComponent as Component } from '@teambit/legacy.consumer-component';
import { ComponentsList } from '@teambit/legacy.component-list';
import { Graph } from 'graphlib';

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
  const workspaceGraph = await buildGraphFromWorkspace(workspace);
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

async function buildGraphFromWorkspace(workspace: Workspace): Promise<Graph> {
  const componentsList = new ComponentsList(workspace);
  const workspaceComponents: Component[] = await componentsList.getFromFileSystem();
  const graph = new Graph();
  const allModelComponents: ModelComponent[] = await workspace.consumer.scope.list();
  const buildGraphP = allModelComponents.map(async (modelComponent) => {
    const latestVersion = modelComponent.getHeadRegardlessOfLaneAsTagOrHash(true);
    const buildVersionP = modelComponent.listVersionsIncludeOrphaned().map(async (versionNum) => {
      if (latestVersion !== versionNum) return;
      const id = modelComponent.toComponentId().changeVersion(versionNum);
      const componentFromWorkspace = workspaceComponents.find((comp) => comp.id.isEqual(id));
      // if the same component exists in the workspace, use it as it might be modified
      const version =
        componentFromWorkspace ||
        (await modelComponent.loadVersion(versionNum, workspace.consumer.scope.objects, false));
      if (!version) {
        // a component might be in the scope with only the latest version (happens when it's a nested dep)
        return;
      }
      DependencyGraph._addDependenciesToGraph(id, graph, version);
    });
    await Promise.all(buildVersionP);
  });
  await Promise.all(buildGraphP);
  workspaceComponents.forEach((component: Component) => {
    const id = component.id;
    DependencyGraph._addDependenciesToGraph(id, graph, component);
  });
  return graph;
}
