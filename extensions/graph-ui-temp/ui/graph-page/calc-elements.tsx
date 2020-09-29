import { useMemo } from 'react';
import { Node, Edge } from 'react-flow-renderer';
import { calcLayout } from './calc-layout';
import { GraphModel } from '../query';

type ElementsOptions = {
  rootNode?: string;
};

export function calcElements(graph: GraphModel | undefined, { rootNode }: ElementsOptions) {
  return useMemo(() => {
    if (!graph) return [];

    const nodes: Node[] = graph.nodes.map((x) => {
      return {
        id: x.id,
        type: 'ComponentNode',
        data: {
          node: x,
          type: x.component.id.fullName === rootNode ? 'root' : undefined,
        },
        position: { x: 0, y: 0 },
      };
    });

    const edges: Edge[] = graph.edges.map((e) => ({
      id: `_${e.sourceId}__${e.targetId}`,
      source: e.sourceId,
      target: e.targetId,
    }));

    const positions = calcLayout(nodes, edges);
    nodes.forEach((x) => (x.position = positions.get(x.id) || { x: 0, y: 0 }));

    return [...nodes, ...edges];
  }, [graph]);
}
