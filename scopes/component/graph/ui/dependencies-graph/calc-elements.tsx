import { useMemo } from 'react';
import { Node, Edge, ArrowHeadType } from 'react-flow-renderer';
import { ComponentID } from '@teambit/component';
import { calcLayout } from './calc-layout';
import { GraphModel } from '../query';

import { depTypeToClass, depTypeToLabel } from './dep-edge';

type ElementsOptions = {
  rootNode?: ComponentID;
};

/**
 * generate Nodes and Edges for the ReactFlowRenderer graph renderer
 */
export function calcElements(graph: GraphModel | undefined, { rootNode }: ElementsOptions) {
  return useMemo(() => {
    if (!graph) return [];

    const positions = calcLayout(graph);

    const nodes: Node[] = Array.from(graph.nodes.values()).map((x) => {
      return {
        id: x.id,
        type: 'ComponentNode',
        data: {
          node: x,
          type: rootNode && x.component.id.isEqual(rootNode, { ignoreVersion: true }) ? 'root' : undefined,
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
      arrowHeadType: ArrowHeadType.Arrow,
    }));

    return [...nodes, ...edges];
  }, [graph]);
}
