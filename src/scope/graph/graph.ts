import { Graph as GraphLib } from 'graphlib';
import Consumer from '../../consumer/consumer';
import ComponentsList from '../../consumer/component/components-list';
import Component from '../../consumer/component';
import { ModelComponent, Version } from '../models';
import { BitId } from '../../bit-id';
import { DEPENDENCIES_TYPES } from '../../consumer/component/dependencies/dependencies';

export default class Graph extends GraphLib {
  getSuccessorsByEdgeTypeRecursively(
    bitId: string,
    successorsList: string[],
    visited: { [key: string]: boolean } = {}
  ) {
    const successors = this.successors(bitId) || [];
    if (successors.length > 0 && !visited[bitId]) {
      successors.forEach(successor => {
        successorsList.push(successor);
        visited[bitId] = true;
        this.getSuccessorsByEdgeTypeRecursively(successor, successorsList, visited);
      });
    }
    return [];
  }

  static _addDependenciesToGraph(id: BitId, graph: Graph, component: Version | Component): void {
    const idStr = id.toString();
    // save the full BitId of a string id to be able to retrieve it later with no confusion
    if (!graph.hasNode(idStr)) graph.setNode(idStr, id);
    DEPENDENCIES_TYPES.forEach(depType => {
      component[depType].get().forEach(dependency => {
        const depIdStr = dependency.id.toString();
        if (!graph.hasNode(depIdStr)) graph.setNode(depIdStr, dependency.id);
        graph.setEdge(idStr, depIdStr, depType);
      });
    });
  }

  static async buildGraphFromWorkspace(consumer: Consumer, onlyLatest = false): Promise<Graph> {
    const componentsList = new ComponentsList(consumer);
    const workspaceComponents: Component[] = await componentsList.getFromFileSystem();
    const graph = new Graph();
    const allModelComponents: ModelComponent[] = await consumer.scope.list();
    const buildGraphP = allModelComponents.map(async modelComponent => {
      const latestVersion = modelComponent.latest();
      const buildVersionP = modelComponent.listVersions().map(async versionNum => {
        if (onlyLatest && latestVersion !== versionNum) return;
        const id = modelComponent.toBitId().changeVersion(versionNum);
        const componentFromWorkspace = workspaceComponents.find(comp => comp.id.isEqual(id));
        // if the same component exists in the workspace, use it as it might be modified
        const version =
          componentFromWorkspace || (await modelComponent.loadVersion(versionNum, consumer.scope.objects));
        if (!version) {
          // a component might be in the scope with only the latest version (happens when it's a nested dep)
          return;
        }
        this._addDependenciesToGraph(id, graph, version);
      });
      await Promise.all(buildVersionP);
    });
    await Promise.all(buildGraphP);

    workspaceComponents.forEach((component: Component) => {
      const id = component.id;
      this._addDependenciesToGraph(id, graph, component);
    });
    return graph;
  }
}
