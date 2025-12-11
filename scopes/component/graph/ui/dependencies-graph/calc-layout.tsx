import dagre, { graphlib } from '@dagrejs/dagre';
import type { EdgeModel, GraphModel, NodeModel } from '../query';

const NODE_WIDTH = 260;
const NODE_HEIGHT = 90;

const TOP_TO_BOTTOM = 'TB';

/**
 * calculate the specific location of each node in the graph
 */
export function calcLayout(graph: GraphModel<NodeModel, EdgeModel>) {
  const g = new graphlib.Graph();
  g.setGraph({
    rankdir: TOP_TO_BOTTOM,
    nodesep: 25,
    ranksep: 100,
    edgesep: 100,
    ranker: 'longest-path',
    acyclicer: 'greedy',
  });
  g.setDefaultEdgeLabel(() => ({}));

  // make a new instance of { width, height } per node, or dagre will get confused and place all nodes in the same spot
  graph.nodes.forEach((n) => g.setNode(n.id, { ...n, width: NODE_WIDTH, height: NODE_HEIGHT }));
  graph.edges.forEach((e) => g.setEdge(e.sourceId, e.targetId));

  // position items in graph
  dagre.layout(g);

  const positionsArr: [string, { x: number; y: number }][] = g.nodes().map((nodeId) => {
    const node = g.node(nodeId);

    const pos = {
      x: node.x - node.width / 2,
      y: node.y - node.height / 2,
    };

    return [nodeId, pos];
  });

  return new Map(positionsArr);
}
