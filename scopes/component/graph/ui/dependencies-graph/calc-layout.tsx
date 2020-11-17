import dagre, { graphlib } from 'dagre';
import { GraphModel } from '../query';

const NODE_WIDTH = 260;
const NODE_HEIGHT = 90;

const BOTTOM_TO_TOP = 'BT';

/**
 * calculate the specific location of each node in the graph
 */
export function calcLayout(graph: GraphModel) {
  const g = new graphlib.Graph();
  g.setGraph({ rankdir: BOTTOM_TO_TOP });
  g.setDefaultEdgeLabel(() => ({}));

  // make a new instance of { width, height } per node, or dagre will get confused and place all nodes in the same spot
  graph.nodes.forEach((n) => g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));
  graph.edges.forEach((e) => g.setEdge({ v: e.sourceId, w: e.targetId }));

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
