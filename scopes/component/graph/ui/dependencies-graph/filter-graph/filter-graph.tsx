import { ComponentID, ComponentModel } from '@teambit/component';
import { Graph } from 'cleargraph';
import { GraphModel, NodeModel, EdgeModel } from '../../query';
import { isRuntime } from './filters';

export function filterGraph(graph?: GraphModel, rootNode?: ComponentID, filter = isRuntime): GraphModel {
  if (!graph || !rootNode) return new GraphModel([], []);

  const g = new Graph(
    graph.nodes.map((n) => ({
      id: n.id,
      node: n.component,
    })),
    graph.edges.map((e) => ({
      sourceId: e.sourceId,
      targetId: e.targetId,
      edge: e,
    }))
  );

  // TODO
  const rootNodeId =
    (g.hasNode(rootNode.toString()) && rootNode.toString()) ||
    (g.hasNode(rootNode.toString({ ignoreVersion: true })) && rootNode.toString({ ignoreVersion: true })) ||
    (g.hasNode(rootNode.fullName) && rootNode.fullName);

  if (!rootNodeId) return { nodes: [] as NodeModel[], edges: [] as EdgeModel[] };

  const filtered = g.successorsSubgraph(rootNodeId, filter);

  return toGraphModel(filtered);
}

function toGraphModel(graph: Graph<ComponentModel, EdgeModel>): GraphModel {
  return {
    nodes: Array.from(graph.nodes.entries()).map(([id, component]) => ({ id, component })),
    edges: Array.from(graph.edges.values()),
  };
}
