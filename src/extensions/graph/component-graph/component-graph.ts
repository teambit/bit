import { Graph } from 'cleargraph';
import { Graph as LegacyGraph } from 'graphlib';
import Component from '../../component/component';
import { Dependency } from '../index';

export const DEPENDENCIES_TYPES = ['dependencies', 'devDependencies', 'compilerDependencies', 'testerDependencies'];

export class ComponentGraph extends Graph<Component, Dependency> {
  buildFromLegacy(legacyGraph: LegacyGraph): Graph<Component, Dependency> {
    console.log(legacyGraph);
    let newGraph = new ComponentGraph();
    legacyGraph.nodes().forEach(nodeId => {
      newGraph.setNode(nodeId, legacyGraph.node(nodeId));
    });
    legacyGraph.edges().forEach(edgeId => {
      const source = edgeId.v;
      const target = edgeId.w;
      const edgeObj = legacyGraph.edge(source, target);
      newGraph.setEdge(source, target, edgeObj);
    });
    return newGraph;
  }
}
