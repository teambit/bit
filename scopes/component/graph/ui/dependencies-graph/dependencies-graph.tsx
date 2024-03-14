import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import classnames from 'classnames';
import ReactFlow, {
  Background,
  Controls,
  Handle,
  MiniMap,
  NodeProps,
  NodeTypesType,
  OnLoadParams,
  Position,
  ReactFlowProps,
  ReactFlowProvider,
} from 'react-flow-renderer';
import { ComponentID } from '@teambit/component';

import { ComponentWidgetSlot } from '../../graph.ui.runtime';
import { ComponentNode } from '../component-node';
import { EdgeModel, GraphModel, NodeModel } from '../query';
import { calcElements } from './calc-elements';
import { calcMinimapColors } from './minimap';
import { ComponentGraphContext } from './graph-context';

import styles from './dependencies-graph.module.scss';

function ComponentNodeContainer(props: NodeProps) {
  const { sourcePosition = Position.Top, targetPosition = Position.Bottom, data, id } = props;
  // @todo - this will be fixed as part of the react-flow-renderer v10 upgrade
  const ReactFlowHandle = Handle as any;
  return (
    <div key={id}>
      <ReactFlowHandle type="target" position={targetPosition} isConnectable={false} />
      <ReactFlowHandle type="source" position={sourcePosition} isConnectable={false} />
      <ComponentNode node={data.node} type={data.type} />
    </div>
  );
}

// @ts-ignore - incorrect NodeTypes https://github.com/wbkd/react-flow/issues/2101 (#5746)
const NodeTypes: NodeTypesType = { ComponentNode: ComponentNodeContainer };

export type DependenciesGraphProps = {
  rootNode: ComponentID;
  graph: GraphModel<NodeModel, EdgeModel>;
  componentWidgets: ComponentWidgetSlot;
  onLoad?: (instance: OnLoadParams) => void;
} & Omit<ReactFlowProps, 'elements'>;

export function DependenciesGraph({
  graph,
  rootNode,
  componentWidgets,
  className,
  onLoad,
  children,
  ...rest
}: DependenciesGraphProps) {
  const graphRef = useRef<OnLoadParams>();
  const elements = calcElements(graph, { rootNode });
  const context = useMemo(() => ({ componentWidgets }), [componentWidgets]);

  const handleLoad = useCallback(
    (instance: OnLoadParams) => {
      if ((graph?.nodes.length ?? 0) <= 3) {
        instance.fitView({
          padding: 2,
        });
      } else {
        instance.fitView();
      }
      onLoad?.(instance);
    },
    [onLoad]
  );

  // clear ref on unmount
  useEffect(() => () => (graphRef.current = undefined), []);

  useEffect(() => {
    setTimeout(() => {
      if (graph.nodes.length <= 3)
        return graphRef.current?.fitView({
          padding: 2,
        });
      return graphRef.current?.fitView();
    }, 0);
  }, [graph]);

  return (
    <ComponentGraphContext.Provider value={context}>
      {/* @ts-ignore - TODO - remove when ReactFlowProvider will be of type `FC<PropsWithChildren<{}>>` instead of `FC` (#5746) */}
      <ReactFlowProvider>
        <ReactFlow
          draggable={false}
          nodesDraggable={true}
          selectNodesOnDrag={false}
          nodesConnectable={false}
          zoomOnDoubleClick={false}
          elementsSelectable={false}
          maxZoom={100}
          minZoom={0}
          {...rest}
          className={classnames(styles.graph, className)}
          elements={elements}
          nodeTypes={NodeTypes}
          onLoad={handleLoad}
        >
          <Background />
          <Controls className={styles.controls} />
          <MiniMap nodeColor={calcMinimapColors} className={styles.minimap} />
          {children}
        </ReactFlow>
      </ReactFlowProvider>
    </ComponentGraphContext.Provider>
  );
}
