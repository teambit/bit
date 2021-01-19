import React, { useMemo, useCallback, useRef, useEffect } from 'react';
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
import { ComponentID } from '@teambit/component';

import { ComponentWidgetSlot } from '../../graph.ui.runtime';
import { ComponentNode } from '../component-node';
import { GraphModel } from '../query';
import { calcElements } from './calc-elements';
import { calcMinimapColors } from './minimap';
import { ComponentGraphContext } from './graph-context';

import styles from './dependencies-graph.module.scss';

function ComponentNodeContainer(props: NodeProps) {
  const { sourcePosition = Position.Top, targetPosition = Position.Bottom, data, id } = props;

  return (
    <div key={id}>
      <Handle type="target" position={targetPosition} isConnectable={false} />
      <Handle type="source" position={sourcePosition} isConnectable={false} />
      <ComponentNode node={data.node} type={data.type} />
    </div>
  );
}

const NodeTypes: NodeTypesType = { ComponentNode: ComponentNodeContainer };

export type DependenciesGraphProps = {
  rootNode: ComponentID;
  graph: GraphModel;
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
      graphRef.current = instance;
      instance.fitView();
      onLoad?.(instance);
    },
    [onLoad]
  );

  // clear ref on unmount
  useEffect(() => () => (graphRef.current = undefined), []);

  useEffect(() => {
    graphRef.current?.fitView();
  }, [graph]);

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
        {children}
      </ReactFlow>
    </ComponentGraphContext.Provider>
  );
}
