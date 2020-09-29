import React, { createContext, useMemo, useCallback } from 'react';
import classnames from 'classnames';
import ReactFlow, {
  Controls,
  Background,
  MiniMap,
  OnLoadParams,
  NodeTypesType,
  Handle,
  Position,
  NodeProps,
  ReactFlowProps,
} from 'react-flow-renderer';
import { useRouteMatch } from 'react-router-dom';

import { NotFoundPage } from '@teambit/pages.not-found';
import { ServerErrorPage } from '@teambit/pages.server-error';
import { FullLoader } from 'bit-bin/dist/to-eject/full-loader';

import { ComponentWidgetSlot } from '../../graph.ui.runtime';
import { ComponentNode } from '../component-node';
import { useGraphQuery } from '../query';

import styles from './graph-page.module.scss';
import { calcElements } from './calc-elements';
import { calcMinimapColors } from './minimap';

const DEFAULT_POS = [80, 80] as [number, number];

const NodeTypes: NodeTypesType = {
  ComponentNode: function ComponentNodeContainer(props: NodeProps) {
    const { sourcePosition = Position.Top, targetPosition = Position.Bottom, data } = props;

    return (
      <div>
        <Handle type="target" position={targetPosition} isConnectable={false} />
        <Handle type="source" position={sourcePosition} isConnectable={false} />
        <ComponentNode node={data.node} type={data.type} />
      </div>
    );
  },
};

type GraphPageProps = { componentWidgets: ComponentWidgetSlot } & ReactFlowProps;

export function GraphPage({ componentWidgets, className, onLoad, ...rest }: GraphPageProps) {
  const {
    params: { componentId },
  } = useRouteMatch();
  const { graph, error } = useGraphQuery([componentId]);

  const elements = calcElements(graph, { rootNode: componentId });
  const context = useMemo(() => ({ componentWidgets }), [componentWidgets]);
  const handleLoad = useCallback(
    (instance: OnLoadParams) => {
      instance.fitView();
      onLoad?.(instance);
    },
    [onLoad]
  );

  if (error) {
    // TODO - unify
    return error.code === 404 ? <NotFoundPage /> : <ServerErrorPage />;
  }
  if (!graph) return <FullLoader />;

  return (
    <ComponentGraphContext.Provider value={context}>
      <ReactFlow
        draggable={false}
        nodesDraggable={true}
        selectNodesOnDrag={false}
        nodesConnectable={false}
        zoomOnDoubleClick={false}
        elementsSelectable={false}
        maxZoom={1}
        {...rest}
        className={classnames(styles.graph, className)}
        elements={elements}
        nodeTypes={NodeTypes}
        onLoad={handleLoad}
      >
        <Background />
        <Controls className={styles.controls} />
        <MiniMap nodeColor={calcMinimapColors} className={styles.minimap} />
      </ReactFlow>
    </ComponentGraphContext.Provider>
  );
}

type ComponentGraphContext = {
  componentWidgets: ComponentWidgetSlot;
};

export const ComponentGraphContext = createContext<ComponentGraphContext | undefined>(undefined);
