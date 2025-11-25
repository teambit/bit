import { useMemo } from 'react';
import type { Edge, Node } from 'reactflow';
import { MarkerType } from 'reactflow';
import type { ComponentID } from '@teambit/component';
import { calcLayout } from './calc-layout';
import type { EdgeModel, GraphModel, NodeModel } from '../query';

import { depTypeToClass, depTypeToLabel } from './dep-edge';

type ElementsOptions = {
  rootNode?: ComponentID;
};

/**
 * generate Nodes and Edges for the ReactFlowRenderer graph renderer
 */
export function calcElements(
  graph: GraphModel<NodeModel, EdgeModel> | undefined,
  { rootNode }: ElementsOptions
): { nodes: Node[]; edges: Edge[] } {
  return useMemo(() => {
    if (!graph) return { nodes: [], edges: [] };

    const positions = calcLayout(graph);

    const nodes: Node[] = Array.from(graph.nodes.values()).map((x) => {
      return {
        id: x.id,
        type: 'ComponentNode',
        data: {
          node: x,
          type: rootNode && x.componentId.isEqual(rootNode, { ignoreVersion: true }) ? 'root' : undefined,
        },
        position: positions.get(x.id) || { x: 0, y: 0 },
      };
    });

    const edges: Edge[] = graph.edges.map((e) => ({
      id: `_${e.sourceId}__${e.targetId}`,
      source: e.sourceId,
      target: e.targetId,
      label: depTypeToLabel(e.dependencyLifecycleType),
      labelBgPadding: [4, 4],
      type: 'smoothstep',
      className: depTypeToClass(e.dependencyLifecycleType),
      arrowHeadType: MarkerType.Arrow,
      markerEnd: {
        type: MarkerType.Arrow,
      },
    }));

    return { nodes, edges };
  }, [graph?.nodes.length, graph?.edges.length, rootNode?.toString(), graph?.nodes.some((n) => n.component)]);
}
