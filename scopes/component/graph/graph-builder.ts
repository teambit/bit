import { ComponentFactory, ComponentID, ComponentMain } from '@teambit/component';
import { Node, Edge } from '@teambit/graph.cleargraph';
import type LegacyGraph from '@teambit/legacy/dist/scope/graph/graph';
import { ComponentGraph } from './component-graph';
import { Dependency } from './model/dependency';

type GetGraphOpts = {
  host?: ComponentFactory;
};

type BuildFromLegacyGraphOpts = {
  host?: ComponentFactory;
};

/**
 * @todo: potential issues with the current way the class is built.
 * it's possible to call `getGraph` multiple times and at the same time (Promise.all).
 * which makes the _graph prop and other props unpredictable.
 */
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
    graph.seederIds = ids || (await componentHost.listIds());
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
        newGraph.setNode(new Node(componentId.toString(), component));
      }
    });
    await Promise.all(setNodeP);

    const setEdgePromise = legacyGraph.edges().map(async (edgeId) => {
      const source = await componentHost.resolveComponentId(edgeId.v);
      const target = await componentHost.resolveComponentId(edgeId.w);
      const edgeObj =
        legacyGraph.edge(edgeId.v, edgeId.w) === 'dependencies' ? new Dependency('runtime') : new Dependency('dev');
      newGraph.setEdge(new Edge(source.toString(), target.toString(), edgeObj));
    });
    await Promise.all(setEdgePromise);

    return newGraph;
  }
}
