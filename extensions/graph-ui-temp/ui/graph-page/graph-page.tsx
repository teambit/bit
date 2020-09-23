import React, { useMemo } from 'react';
import ReactFlow, { Node, Controls, Background } from 'react-flow-renderer';
import { FullLoader } from 'bit-bin/dist/to-eject/full-loader';

import { calcLayout } from './calc-layout';
import { ComponentNode } from '../component-node';
import { useGraph } from '../query';

import styles from './graph-page.module.scss';

const DEFAULT_POS = [80, 80] as [number, number];

const NodeTypes = {
  default: function DefaultNode() {
    return <div>I am default node</div>;
  },
  ComponentNode: function CNW(props: any) {
    return <ComponentNode node={props.data} />;
  },
};

export function GraphPage() {
  const { graph } = useGraph();

  const elements = useMemo(() => {
    if (!graph) return [];

    const nodes: Node[] = graph.nodes.map((x) => {
      return {
        id: x.id,
        type: 'ComponentNode',
        data: x,
        position: { x: 0, y: 0 },
      };
    });

    const edges = graph.edges.map((e) => ({
      id: `_${e.sourceId}__${e.targetId}`,
      source: e.sourceId,
      target: e.targetId,
    }));

    const positions = calcLayout(nodes, edges);
    nodes.forEach((x) => (x.position = positions.get(x.id) || { x: 0, y: 0 }));

    return [...nodes, ...edges];
  }, [graph]);

  // TODO!
  if (!graph) return <FullLoader />;

  return (
    <ReactFlow
      className={styles.graph}
      elements={elements}
      nodeTypes={NodeTypes}
      draggable={false}
      nodesDraggable={false}
      selectNodesOnDrag={false}
      nodesConnectable={false}
      zoomOnDoubleClick={false}
      elementsSelectable={false}
      defaultPosition={DEFAULT_POS}
    >
      <Background />
      <Controls style={{ left: 'unset', right: 8 }} />
    </ReactFlow>
  );
}
