import React from 'react';
import ReactFlow, { Node, Controls, Background, MiniMap } from 'react-flow-renderer';
import { useRouteMatch } from 'react-router-dom';

import { NotFoundPage } from '@teambit/pages.not-found';
import { ServerErrorPage } from '@teambit/pages.server-error';
import { FullLoader } from 'bit-bin/dist/to-eject/full-loader';

import { ComponentNode } from '../component-node';
import { useGraphQuery } from '../query';

import styles from './graph-page.module.scss';
import { calcElements } from './calc-elements';
import { calcMinimapColors } from './minimap';

const DEFAULT_POS = [80, 80] as [number, number];

const NodeTypes = {
  default: function DefaultNode() {
    return <div>I am default node</div>;
  },
  ComponentNode: function CNW(props: any) {
    return <ComponentNode node={props.data.node} type={props.data.type} />;
  },
};

export function GraphPage() {
  const {
    params: { componentId },
  } = useRouteMatch();
  const { graph, error } = useGraphQuery([componentId]);

  const elements = calcElements(graph, { rootNode: componentId });

  if (error) {
    // TODO - unify
    return error.code === 404 ? <NotFoundPage /> : <ServerErrorPage />;
  }
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
      <Controls className={styles.controls} />
      <MiniMap nodeColor={calcMinimapColors} className={styles.minimap} />
    </ReactFlow>
  );
}
