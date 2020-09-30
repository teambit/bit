import React, { useMemo, useCallback, HTMLAttributes } from 'react';
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
} from 'react-flow-renderer';
import { useRouteMatch } from 'react-router-dom';

import { NotFoundPage } from '@teambit/pages.not-found';
import { ServerErrorPage } from '@teambit/pages.server-error';
import { FullLoader } from 'bit-bin/dist/to-eject/full-loader';

import { ComponentWidgetSlot } from '../../graph.ui.runtime';
import { ComponentNode } from '../component-node';
import { useGraphQuery } from '../query';
import { calcElements } from './calc-elements';
import { calcMinimapColors } from './minimap';
import { ComponentGraphContext } from './graph-context';

import styles from './dependencies-graph.module.scss';

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

// @TODO - temporary, until react-flow-renderer will export ReactFlowProps
type ReactFlowProps = Omit<HTMLAttributes<HTMLDivElement>, 'onLoad'>;
export type DependenciesGraphProps = {
  componentWidgets: ComponentWidgetSlot;
  onLoad?: (instance: OnLoadParams) => void;
} & ReactFlowProps;

export function DependenciesGraph({ componentWidgets, className, onLoad, ...rest }: DependenciesGraphProps) {
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
