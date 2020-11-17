import { useMemo } from 'react';
import { Node, Edge, ArrowHeadType } from 'react-flow-renderer';
import { ComponentID } from '@teambit/component';
import { calcLayout } from './calc-layout';
import { GraphModel } from '../query';

import { depTypeToClass, depTypeToLabel } from './dep-edge';
import { filterGraph, isRuntimeOrMine } from './filter-graph';

type ElementsOptions = {
  rootNode?: ComponentID;
};

/**
 * generate Nodes and Edges for the ReactFlowRenderer graph renderer
 */
export function calcElements(graph: GraphModel | undefined, { rootNode }: ElementsOptions) {
  const filteredGraph = useMemo(() => filterGraph(graph, rootNode, isRuntimeOrMine(rootNode?.toString() || '')), [
    graph,
  ]);

  return useMemo(() => {
    if (!graph) return [];

    const nodes: Node[] = Array.from(filteredGraph.nodes.values()).map((x) => {
      return {
        id: x.id,
        type: 'ComponentNode',
        data: {
          node: x,
          type: rootNode && x.component.id.isEqual(rootNode) ? 'root' : undefined,
        },
        position: { x: 0, y: 0 },
      };
    });

    const edges: Edge[] = filteredGraph.edges.map((e) => ({
      id: `_${e.sourceId}__${e.targetId}`,
      source: e.sourceId,
      target: e.targetId,
      label: depTypeToLabel(e.dependencyLifecycleType),
      labelBgPadding: [4, 4],
      type: 'smoothstep',
      className: depTypeToClass(e.dependencyLifecycleType),
      arrowHeadType: ArrowHeadType.Arrow,
    }));

    const positions = calcLayout(nodes, edges);
    nodes.forEach((x) => (x.position = positions.get(x.id) || { x: 0, y: 0 }));

    return [...nodes, ...edges];
  }, [filteredGraph]);
}
