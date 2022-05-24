import { ComponentID } from '@teambit/component-id';
import { depTypeToClass, depTypeToLabel } from '@teambit/graph';
import { ArrowHeadType, Edge, Node } from 'react-flow-renderer';
import { calcLayout } from './calc-layout';
import { CompareGraphModel } from './compare-graph-model';

export function calcElements(graph: CompareGraphModel, baseId: string, compareId: string) {
  if (!graph) return [];

  const positions = calcLayout(graph);

  const nodes: Node[] = Array.from(graph.nodes.values()).map((x) => {
    const rootNode = x.id === baseId || x.id === compareId ? ComponentID.fromString(x.id) : undefined;
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
}
