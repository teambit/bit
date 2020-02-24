import { Graph } from 'cleargraph';
import Component from '../../component/component';
import { Dependency } from '../index';
import { ComponentFactory } from '../../component';
import { Consumer } from '../../../consumer';
import ComponentsList from '../../../consumer/component/components-list';
import { ModelComponent, Version } from '../../../scope/models';
import Capsule from '../../../environment/capsule-builder';
import ConsumerComponent from '../../../consumer/component';
import { BitId } from '../../../bit-id';

export const DEPENDENCIES_TYPES = ['dependencies', 'devDependencies', 'compilerDependencies', 'testerDependencies'];

export class ComponentGraph extends Graph<Component, Dependency> {
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  static async buildFromWorkspace(
    consumer: Consumer,
    componentFactory: ComponentFactory,
    onlyLatest = false,
    reverse = false
  ): Promise<Graph<Component, Dependency>> {
    const componentsList = new ComponentsList(consumer);
    const workspaceComponents: ConsumerComponent[] = await componentsList.getFromFileSystem();
    const graph = new Graph<Component, Dependency>();
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
        this._addDependenciesToGraph(id, graph, version, reverse);
      });
      await Promise.all(buildVersionP);
    });
    await Promise.all(buildGraphP);
    console.log(workspaceComponents);
    workspaceComponents.forEach((component: ConsumerComponent) => {
      const id = component.id;
      this._addDependenciesToGraph(id, graph, component, reverse);
    });
    return graph;
  }

  static _addDependenciesToGraph(
    id: BitId,
    graph: Graph<Component, Dependency>,
    component: Version | Component,
    reverse = false
  ): void {
    const idStr = id.toString();
    // save the full BitId of a string id to be able to retrieve it later with no confusion
    if (!graph.hasNode(idStr)) graph.setNode(new Node(idStr, id));
    DEPENDENCIES_TYPES.forEach(depType => {
      component[depType].get().forEach(dependency => {
        const depIdStr = dependency.id.toString();
        if (!graph.hasNode(depIdStr)) graph.setNode(depIdStr, dependency.id);
        if (reverse) {
          graph.setEdge(depIdStr, idStr, depType);
        } else {
          graph.setEdge(idStr, depIdStr, depType);
        }
      });
    });
  }
}

function buildFromLegacyGraph(legacyGraph: GLG, componentFactory: ComponentFactory) {
  console.log(legacyGraph);
  let newGraph: ComponentGraph = new ComponentGraph();
  legacyGraph.nodes().forEach((node: string) => {
    let NodeContent = legacyGraph.node(node);
    newGraph.setNode(componentFactory.fromRawComponent({ id: node, content: NodeContent }));
  });
}
