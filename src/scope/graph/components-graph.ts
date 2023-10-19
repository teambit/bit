import { Graph as GraphLib } from 'graphlib';
import { ComponentID } from '@teambit/component-id';
import Component from '../../consumer/component/consumer-component';
import Dependencies from '../../consumer/component/dependencies/dependencies';
import Graph from './graph';

/**
 * one graph of the given components. it doesn't fetch/load anything. it builds the graph with the
 * given data. the node is a ComponentID and the edge has the label of the dependency type. it can be
 * either "dependencies" or "devDependencies".
 */
export function buildComponentsGraphCombined(components: Component[]): Graph {
  const graph = new Graph();
  components.forEach((component) => {
    _setGraphEdges(component.id, component.dependencies, graph);
    _setGraphEdges(component.id, component.devDependencies, graph, 'devDependencies');
    _setGraphEdges(component.id, component.extensionDependencies, graph, 'devDependencies');
  });
  return graph;
}

function _setGraphEdges(bitId: ComponentID, dependencies: Dependencies, graph: GraphLib, label = 'dependencies') {
  const id = bitId.toString();
  dependencies.get().forEach((dependency) => {
    const depId = dependency.id.toString();
    // save the full ComponentID of a string id to be able to retrieve it later with no confusion
    if (!graph.hasNode(id)) graph.setNode(id, bitId);
    if (!graph.hasNode(depId)) graph.setNode(depId, dependency.id);
    graph.setEdge(id, depId, label);
  });
}
