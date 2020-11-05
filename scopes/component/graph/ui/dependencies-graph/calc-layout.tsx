import dagre, { graphlib } from 'dagre';
import { Edge, FlowElement } from 'react-flow-renderer';

const NODE_WIDTH = 260;
const NODE_HEIGHT = 90;

const BOTTOM_TO_TOP = 'BT';

/**
 * calculate the specific location of each node in the graph
 */
export function calcLayout(nodes: FlowElement[], edges: Edge[]) {
  const g = new graphlib.Graph();
  g.setGraph({ rankdir: BOTTOM_TO_TOP });
  g.setDefaultEdgeLabel(() => ({}));

  nodes.forEach((e) => {
    g.setNode(e.id, {
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    });
  });

  edges.forEach((x) => {
    g.setEdge({ v: x.source, w: x.target });
  });

  dagre.layout(g);

  const positionsArr: [string, { x: number; y: number }][] = g.nodes().map((nodeId) => {
    const dagreNode = g.node(nodeId);

    return [
      nodeId,
      {
        x: dagreNode.x - dagreNode.width / 2,
        y: dagreNode.y - dagreNode.height / 2,
      },
    ];
  });

  return new Map(positionsArr);
}
