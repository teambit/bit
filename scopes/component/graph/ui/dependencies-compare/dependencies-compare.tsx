import classNames from 'classnames';
import { RoundLoader } from '@teambit/design.ui.round-loader';
import { useComponentCompare } from '@teambit/component.ui.component-compare.context';
import React, { useEffect, useRef, useState, useCallback } from 'react';
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
import { useGraphQuery } from '../query';
import { GraphFilter } from '../../model/graph-filters';
import { GraphFilters, styles as graphPageStyles } from '../graph-page';
import { calcMinimapColors, calcElements, styles as dependenciesGraphStyles } from '../dependencies-graph';
import styles from './dependencies-compare.module.scss';
import { DependencyCompareNode } from './dependency-compare-node';
import { diffGraph } from './diff-graph';

function ComponentNodeContainer(props: NodeProps) {
  const { sourcePosition = Position.Top, targetPosition = Position.Bottom, data, id } = props;
  // @todo - this will be fixed as part of the react-flow-renderer v10 upgrade
  const ReactFlowHandle = Handle as any;
  return (
    <div key={id}>
      <ReactFlowHandle type="target" position={targetPosition} isConnectable={false} />
      <ReactFlowHandle type="source" position={sourcePosition} isConnectable={false} />
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

  useEffect(() => () => (graphRef.current = undefined), []);

  useEffect(() => {
    graphRef.current?.fitView();
  }, [elements]);

  const handleLoad = useCallback(
    (instance: OnLoadParams) => {
      graphRef.current = instance;
      if ((graph?.nodes.length ?? 0) <= 3) {
        graphRef.current?.fitView({
          padding: 2,
        });
      } else {
        instance.fitView();
      }
    },
    [graph?.nodes.length]
  );

  useEffect(() => {
    setTimeout(() => {
      if ((graph?.nodes.length ?? 0) <= 3)
        return graphRef.current?.fitView({
          padding: 2,
        });
      return graphRef.current?.fitView();
    }, 0);
  }, [compareId?.toString(), baseId?.toString()]);

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
          maxZoom={100}
          minZoom={0}
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
