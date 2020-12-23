import { ComponentID } from '@teambit/component';
import { ComponentFactory } from '@teambit/component';
import { ComponentGraph } from './component-graph';
import { Graph as LegacyGraph } from 'bit-bin/dist/scope/graph/graph';
import { Dependency } from './model/dependency';

export class GraphBuilder {
  _graph?: ComponentGraph;
  _initialized = false;
  constructor(private componentHost: ComponentFactory) {}

  async getGraph(ids?: ComponentID[]): Promise<ComponentGraph | undefined> {
    const legacyGraph = await this.componentHost.getLegacyGraph(ids);
    const graph = await this.buildFromLegacy(legacyGraph);

    this._graph = graph;
    this._initialized = true;
    return this._graph;
  }

  private async buildFromLegacy(legacyGraph: LegacyGraph): Promise<ComponentGraph> {
    const newGraph = new ComponentGraph();

    const setNodeP = legacyGraph.nodes().map(async (nodeId) => {
      const componentId = await this.componentHost.resolveComponentId(nodeId);
      const component = await this.componentHost.get(componentId);
      if (component) {
        newGraph.setNode(componentId.toString(), component);
      }
    });
    await Promise.all(setNodeP);

    const setEdgePromise = legacyGraph.edges().map(async (edgeId) => {
      const source = await this.componentHost.resolveComponentId(edgeId.v);
      const target = await this.componentHost.resolveComponentId(edgeId.w);
      const edgeObj =
        legacyGraph.edge(edgeId.v, edgeId.w) === 'dependencies' ? new Dependency('runtime') : new Dependency('dev');
      newGraph.setEdge(source.toString(), target.toString(), edgeObj);
    });
    await Promise.all(setEdgePromise);

    newGraph.versionMap = newGraph._calculateVersionMap();
    return newGraph;
  }
}
