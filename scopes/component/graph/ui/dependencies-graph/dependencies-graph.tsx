import React, { useCallback, useMemo, useRef, useEffect } from 'react';
import classnames from 'classnames';
import ReactFlow, {
  Background,
  Controls,
  Handle,
  MiniMap,
  NodeProps,
  NodeTypes,
  ReactFlowInstance,
  Position,
  ReactFlowProps,
  ReactFlowProvider,
} from 'reactflow';
import { ComponentID } from '@teambit/component';
import { ComponentWidgetSlot } from '../../graph.ui.runtime';
import { ComponentNode } from '../component-node';
import { EdgeModel, GraphModel, NodeModel } from '../query';
import { calcElements } from './calc-elements';
import { calcMinimapColors } from './minimap';
import { ComponentGraphContext } from './graph-context';
import 'reactflow/dist/style.css';
import styles from './dependencies-graph.module.scss';

function ComponentNodeContainer(props: NodeProps) {
  const { sourcePosition = Position.Top, targetPosition = Position.Bottom, data, id } = props;
  const ReactFlowHandle = Handle;
  return (
    <div key={id}>
      <ReactFlowHandle type="target" position={targetPosition} isConnectable={false} />
      <ReactFlowHandle type="source" position={sourcePosition} isConnectable={false} />
      <ComponentNode node={data.node} type={data.type} />
    </div>
  );
}

export type DependenciesGraphProps = {
  rootNode: ComponentID;
  graph?: GraphModel<NodeModel, EdgeModel>;
  componentWidgets: ComponentWidgetSlot;
  onLoad?: (instance: ReactFlowInstance) => void;
  loadingGraphMetadata?: boolean;
} & Omit<ReactFlowProps, 'elements'>;

export function DependenciesGraph({
  graph,
  rootNode,
  componentWidgets,
  className,
  onLoad,
  children,
  loadingGraphMetadata,
  ...rest
}: DependenciesGraphProps) {
  const nodeTypes: NodeTypes = React.useMemo(() => ({ ComponentNode: ComponentNodeContainer }), []);
  const graphRef = useRef<ReactFlowInstance>();
  const elements = calcElements(graph, { rootNode });
  const context = useMemo(
    () => ({ componentWidgets, loadingGraphMetadata }),
    [componentWidgets, loadingGraphMetadata, className]
  );

  const handleLoad = useCallback(
    (instance: ReactFlowInstance) => {
      graphRef.current = instance;
      if ((elements?.nodes.length ?? 0) <= 3) {
        instance.fitView({
          padding: 2,
          maxZoom: 1,
        });
      } else {
        instance.fitView({
          maxZoom: 1,
        });
      }
      onLoad?.(instance);
    },
    [onLoad]
  );

  // clear ref on unmount
  useEffect(() => () => (graphRef.current = undefined), []);

  useEffect(() => {
    setTimeout(() => {
      if (!elements?.nodes.length) return;
      if ((elements?.nodes?.length ?? 0) <= 3) {
        return graphRef.current?.fitView({
          padding: 2,
          maxZoom: 1,
        });
      }
      return graphRef.current?.fitView({
        maxZoom: 1,
      });
    }, 100);
  }, [elements?.nodes.length]);

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
          nodes={elements.nodes}
          edges={elements.edges}
          nodeTypes={nodeTypes}
          onInit={handleLoad}
          fitView={true}
          fitViewOptions={{
            padding: (elements?.nodes.length ?? 0) <= 3 ? 2 : undefined,
            maxZoom: 1,
          }}
          proOptions={{
            hideAttribution: true,
          }}
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
