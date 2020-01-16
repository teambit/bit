import R from 'ramda';
import { Graph } from '../graph';
import { Component } from '../component';
import ConsumerComponent from '../consumer/component';
import { Consumer } from '../consumer';
import ComponentsList from '../consumer/component/components-list';
import { ModelComponent } from '../scope/models';
import { DEPENDENCIES_TYPES } from '../consumer/component/dependencies/dependencies';

// TODO: Change to component graph
export async function buildGraph(consumer: Consumer): Promise<Graph> {
  const graph = new Graph();
  const componentsList = new ComponentsList(consumer);
  // const allModelComponents: ModelComponent[] = await consumer.scope.list();
  const workspaceComponents: ConsumerComponent[] = await componentsList.getFromFileSystem();
  const addNodesP = workspaceComponents.map(async (consumerComponent: ConsumerComponent) => {
    const id = consumerComponent.id.toString();
    const modelComponent = await consumer.scope.getModelComponentIfExist(consumerComponent.id);
    const component = await Component.fromLegacy(
      consumerComponent.id,
      consumerComponent,
      modelComponent,
      consumer.scope.objects
    );
    return graph.setNode(id, component);
  });
  await Promise.all(addNodesP);
  const allModelComponents = await consumer.scope.list();
  const addModelsOnlyNodes = allModelComponents.map(async (modelComponent: ModelComponent) => {
    const id = modelComponent.id();
    if (graph.hasNode(id)) {
      return Promise.resolve();
    }
    const component = await Component.fromLegacy(
      modelComponent.toBitId(),
      undefined,
      modelComponent,
      consumer.scope.objects
    );
    return graph.setNode(id, component);
  });
  await Promise.all(addModelsOnlyNodes);
  // TODO: we should have a wat to get the nodes instead of the nodes keys
  const allIds = graph.nodes();
  allIds.forEach(componentId => {
    const node = graph.node(componentId);
    _addDependenciesToGraph(node, graph);
  });
  return graph;
}

function _addDependenciesToGraph(node: Component, graph: Graph): void {
  const idStr = node.id.toString();
  // save the full BitId of a string id to be able to retrieve it later with no confusion
  DEPENDENCIES_TYPES.forEach(depType => {
    component[depType].get().forEach(dependency => {
      const depIdStr = dependency.id.toString();
      // if (!graph.hasNode(depIdStr)) graph.setNode(depIdStr, dependency.id);
      graph.setEdge(idStr, depIdStr, [depType]);
    });
  });
}
