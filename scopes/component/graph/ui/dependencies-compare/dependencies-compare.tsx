import classNames from 'classnames';
import { useComponentCompare } from '@teambit/component.ui.compare';
import { RoundLoader } from '@teambit/design.ui.round-loader';
import {
  calcElements,
  calcMinimapColors,
  dependenciesGraphStyles,
  GraphFilter,
  GraphFilters,
  graphPageStyles,
  useGraphQuery,
} from '@teambit/graph';
import React, { useEffect, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  Handle,
  MiniMap,
  NodeProps,
  NodeTypesType,
  OnLoadParams,
  Position,
  ReactFlowProvider,
} from 'react-flow-renderer';
import styles from './dependencies-compare.module.scss';
import { DependencyCompareNode } from './dependency-compare-node';
import { diffGraph } from './diff-graph';

function ComponentNodeContainer(props: NodeProps) {
  const { sourcePosition = Position.Top, targetPosition = Position.Bottom, data, id } = props;

  return (
    <div key={id}>
      <Handle type="target" position={targetPosition} isConnectable={false} />
      <Handle type="source" position={sourcePosition} isConnectable={false} />
      <DependencyCompareNode node={data.node} type={data.type} />
    </div>
  );
}

const NodeTypes: NodeTypesType = { ComponentNode: ComponentNodeContainer };

export function DependenciesCompare() {
  const graphRef = useRef<OnLoadParams>();
  const componentCompare = useComponentCompare();

  const baseId = componentCompare?.base?.model.id;
  const compareId = componentCompare?.compare?.model.id;

  const [filter, setFilter] = useState<GraphFilter>('runtimeOnly');
  const isFiltered = filter === 'runtimeOnly';
  const { loading: baseLoading, graph: baseGraph } = useGraphQuery(baseId && [baseId.toString()], filter);
  const { loading: compareLoading, graph: compareGraph } = useGraphQuery(compareId && [compareId.toString()], filter);
  const loading = baseLoading || compareLoading;
  const graph = diffGraph(baseGraph, compareGraph, baseId) ?? undefined;
  const elements = calcElements(graph, { rootNode: baseId });

  useEffect(() => {
    graphRef.current?.fitView();
  }, [elements]);

  function handleLoad(instance: OnLoadParams) {
    graphRef.current = instance;
    graphRef.current?.fitView();
  }

  const onCheckFilter = (_isFiltered: boolean) => {
    setFilter(_isFiltered ? 'runtimeOnly' : undefined);
  };

  if (!loading && (!baseGraph || !compareGraph)) {
    return <></>;
  }

  return (
    <div className={classNames([styles.page, graphPageStyles.graph])}>
      {loading && (
        <div className={styles.loader}>
          <RoundLoader />
        </div>
      )}
      <ReactFlowProvider>
        <ReactFlow
          draggable={false}
          nodesDraggable={true}
          selectNodesOnDrag={false}
          nodesConnectable={false}
          zoomOnDoubleClick={false}
          elementsSelectable={false}
          maxZoom={1}
          className={dependenciesGraphStyles.graph}
          elements={elements}
          nodeTypes={NodeTypes}
          onLoad={handleLoad}
        >
          <Background />
          <Controls className={dependenciesGraphStyles.controls} />
          <MiniMap nodeColor={calcMinimapColors} className={dependenciesGraphStyles.minimap} />
          <GraphFilters
            className={graphPageStyles.filters}
            disable={loading}
            isFiltered={isFiltered}
            onChangeFilter={onCheckFilter}
          />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
