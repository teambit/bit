import { Graph } from 'cleargraph';
import { Graph as LegacyGraph } from 'graphlib';
import Component from '../../component/component';
import { Dependency } from '../index';
import { Workspace } from '../../workspace';
import { buildOneGraphForComponents } from '../../../scope/graph/components-graph';

export const DEPENDENCIES_TYPES = ['dependencies', 'devDependencies', 'compilerDependencies', 'testerDependencies'];

export class ComponentGraph extends Graph<Component, Dependency> {
  static buildFromLegacy(legacyGraph: LegacyGraph): Graph<Component, Dependency> {
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

  static async build(workspace: Workspace) {
    const ids = (await workspace.list()).map(comp => comp.id);
    const bitIds = ids.map(id => id._legacy);
    const initialGraph = await buildOneGraphForComponents(bitIds, workspace.consumer);
    return this.buildFromLegacy(initialGraph);
  }
}
