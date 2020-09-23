import React, { useContext, useMemo } from 'react';
import ReactFlow, { Node, Edge, Controls } from 'react-flow-renderer';
import { WorkspaceContext } from '@teambit/workspace';

import { calcLayout } from './calc-layout';
import { randomLinks } from './random-links';
import { ComponentNode } from './graph-component-node';

const NodeTypes = {
  default: function DefaultNode() {
    return <div>I am default node</div>;
  },
  ComponentNode: function CNW(props: any) {
    return <ComponentNode component={props.data} />;
  },
};

export function GraphPage() {
  const workspace = useContext(WorkspaceContext);
  const { components } = workspace;

  const elements = useMemo(() => {
    const sample = components.slice(0, 12);

    const nodes: Node[] = sample.map((x) => {
      return {
        id: x.id.toString(),
        type: 'ComponentNode',
        data: x,
        position: { x: 0, y: 0 },
      };
    });

    const links = randomLinks(sample, 12).filter(([a, b]) => !!a && !!b);
    const edges: Edge[] = links.map(([a, b]) => ({
      id: `__${a.id.toString()}__${b.id.toString()}`,
      source: a.id.toString(),
      target: b.id.toString(),
    }));

    const positions = calcLayout(nodes, edges);
    nodes.forEach((x) => (x.position = positions.get(x.id) || { x: 0, y: 0 }));

    return [...nodes, ...edges];
  }, []);

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        elements={elements}
        style={{ border: '1px solid black' }}
        contextMenu="hello"
        nodesDraggable={false}
        nodesConnectable={false}
        nodeTypes={NodeTypes}
        zoomOnDoubleClick={false}
        selectNodesOnDrag={false}
      >
        <Controls style={{ left: 'unset', right: 8 }} />
      </ReactFlow>
    </div>
  );
  // <div>WIP - initial graph page</div>;
}
