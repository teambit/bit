import React, { useContext, useMemo } from 'react';
import ReactFlow, { Node, Edge, Controls } from 'react-flow-renderer';
// import { WorkspaceContext } from '@teambit/workspace';
import { FullLoader } from 'bit-bin/dist/to-eject/full-loader';

import { calcLayout } from './calc-layout';
import { randomLinks } from './random-links';
import { ComponentNode } from '../component-node';
import { useGraph } from '../query';

const NodeTypes = {
  default: function DefaultNode() {
    return <div>I am default node</div>;
  },
  ComponentNode: function CNW(props: any) {
    return <ComponentNode component={props.data} />;
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
      elements={elements}
      draggable={false}
      nodesDraggable={true}
      nodesConnectable={false}
      nodeTypes={NodeTypes}
      zoomOnDoubleClick={false}
      selectNodesOnDrag={false}
    >
      <Controls style={{ left: 'unset', right: 8 }} />
    </ReactFlow>
  );
}
