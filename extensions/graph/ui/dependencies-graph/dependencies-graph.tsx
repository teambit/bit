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

import { ComponentWidgetSlot } from '../../graph.ui.runtime';
import { ComponentNode } from '../component-node';
import { GraphModel } from '../query';
import { calcElements } from './calc-elements';
import { calcMinimapColors } from './minimap';
import { ComponentGraphContext } from './graph-context';

import styles from './dependencies-graph.module.scss';

const NodeTypes: NodeTypesType = {
  ComponentNode: function ComponentNodeContainer(props: NodeProps) {
    const { sourcePosition = Position.Top, targetPosition = Position.Bottom, data, id } = props;

    return (
      <div key={id}>
        <Handle type="target" position={targetPosition} isConnectable={false} />
        <Handle type="source" position={sourcePosition} isConnectable={false} />
        <ComponentNode node={data.node} type={data.type} />
      </div>
    );
  },
};

// temporary type, until react-flow-renderer will export ReactFlowProps
type ReactFlowProps = Omit<HTMLAttributes<HTMLDivElement>, 'onLoad'>;
export type DependenciesGraphProps = {
  rootNode: string;
  graph: GraphModel;
  componentWidgets: ComponentWidgetSlot;
  onLoad?: (instance: OnLoadParams) => void;
} & ReactFlowProps;

export function DependenciesGraph({
  graph,
  rootNode,
  componentWidgets,
  className,
  onLoad,
  ...rest
}: DependenciesGraphProps) {
  const elements = calcElements(graph, { rootNode });
  const context = useMemo(() => ({ componentWidgets }), [componentWidgets]);

  const handleLoad = useCallback(
    (instance: OnLoadParams) => {
      instance.fitView();
      onLoad?.(instance);
    },
    [onLoad]
  );

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
