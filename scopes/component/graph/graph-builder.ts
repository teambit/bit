import { Component, ComponentFactory, ComponentID, ComponentMain } from '@teambit/component';
import { Edge, Graph } from '@teambit/graph.cleargraph';
import { ComponentGraph } from './component-graph';
import { ComponentIdGraph } from './component-id-graph';
import { Dependency } from './model/dependency';

export type GetGraphOpts = {
  host?: ComponentFactory;
};

export class GraphBuilder {
  constructor(private componentAspect: ComponentMain) {}

  async getGraph(ids?: ComponentID[], opts: GetGraphOpts = {}): Promise<ComponentGraph> {
    const componentHost = opts.host || this.componentAspect.getHost();

    const graph = await componentHost.getGraph(ids, false);
    const componentGraph = await this.toComponentGraph(graph);
    componentGraph.seederIds = ids || (await componentHost.listIds());
    return componentGraph;
  }

  async getGraphIds(ids?: ComponentID[], opts: GetGraphOpts = {}): Promise<ComponentIdGraph> {
    const componentHost = opts.host || this.componentAspect.getHost();

    const graph = await componentHost.getGraphIds(ids, false);
    const componentIdGraph = new ComponentIdGraph(graph.nodes, graph.edges);
    componentIdGraph.seederIds = ids || (await componentHost.listIds());
    return componentIdGraph;
  }

  private async toComponentGraph(graph: Graph<Component, string>): Promise<ComponentGraph> {
    const newGraph = new ComponentGraph();
    graph.nodes.forEach((node) => {
      newGraph.setNode(node);
    });
    graph.edges.forEach((edge) => {
      const edgeObj = edge.attr === 'dependencies' ? new Dependency('runtime') : new Dependency('dev');
      newGraph.setEdge(new Edge(edge.sourceId, edge.targetId, edgeObj));
    });
    return newGraph;
  }
}
