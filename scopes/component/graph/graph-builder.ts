import { ComponentFactory, ComponentID, ComponentMain } from '@teambit/component';
import type LegacyGraph from '@teambit/legacy/dist/scope/graph/graph';
import { ComponentGraph } from './component-graph';
import { Dependency } from './model/dependency';

type GetGraphOpts = {
  host?: ComponentFactory;
};

type BuildFromLegacyGraphOpts = {
  host?: ComponentFactory;
};
export class GraphBuilder {
  _graph?: ComponentGraph;
  _initialized = false;
  constructor(private componentAspect: ComponentMain) {}

  async getGraph(ids?: ComponentID[], opts: GetGraphOpts = {}): Promise<ComponentGraph> {
    const componentHost = opts.host || this.componentAspect.getHost();

    const legacyGraph = await componentHost.getLegacyGraph(ids);
    const graph = await this.buildFromLegacy(legacyGraph, { host: opts.host });
    this._graph = graph;
    this._initialized = true;
    return this._graph;
  }

  private async buildFromLegacy(
    legacyGraph: LegacyGraph,
    opts: BuildFromLegacyGraphOpts = {}
  ): Promise<ComponentGraph> {
    const newGraph = new ComponentGraph();
    const componentHost = opts.host || this.componentAspect.getHost();

    const setNodeP = legacyGraph.nodes().map(async (nodeId) => {
      const componentId = await componentHost.resolveComponentId(nodeId);
      const component = await componentHost.get(componentId);
      if (component) {
        newGraph.setNode(componentId.toString(), component);
      }
    });
    await Promise.all(setNodeP);

    const setEdgePromise = legacyGraph.edges().map(async (edgeId) => {
      const source = await componentHost.resolveComponentId(edgeId.v);
      const target = await componentHost.resolveComponentId(edgeId.w);
      const edgeObj =
        legacyGraph.edge(edgeId.v, edgeId.w) === 'dependencies' ? new Dependency('runtime') : new Dependency('dev');
      newGraph.setEdge(source.toString(), target.toString(), edgeObj);
    });
    await Promise.all(setEdgePromise);

    newGraph.versionMap = newGraph._calculateVersionMap();
    return newGraph;
  }
}
