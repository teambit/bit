import { useComponentCompareContext } from '@teambit/component.ui.compare';
import { RoundLoader } from '@teambit/design.ui.round-loader';
import {
  calcElements,
  calcMinimapColors,
  EdgeModel,
  GraphFilter,
  GraphFilters,
  GraphModel,
  NodeModel,
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
import { ComponentID } from '@teambit/component';
import { CompareGraphModel } from './compare-graph-model';
import { CompareNodeModel } from './compare-node-model';
import styles from './dependencies-compare.module.scss';
import { DependencyCompareNode } from './dependency-compare-node';

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

function buildGraph(baseGraph?: GraphModel, compareGraph?: GraphModel, baseId?: ComponentID) {
  if (!baseGraph || !compareGraph || !baseId) return null;

  // this is to get a key with versions ignored so that we'll have a unique set of component nodes
  const getIdWithoutVersionFromNode = (node: NodeModel) => node.component.id.toStringWithoutVersion();
  const getIdWithoutVersionFromNodeId = (nodeId: string) => nodeId.split('@')[0];
  const delim = '::';
  const getEdgeId = (_e: EdgeModel) => {
    return `${getIdWithoutVersionFromNodeId(_e.sourceId)}${delim}${getIdWithoutVersionFromNodeId(_e.targetId)}`;
  };

  const baseNodes = baseGraph.nodes;
  const compareNodes = compareGraph.nodes;

  const baseNodesMap = new Map<string, NodeModel>(baseNodes.map((n) => [getIdWithoutVersionFromNode(n), n]));
  const compareNodesMap = new Map<string, NodeModel>(compareNodes.map((n) => [getIdWithoutVersionFromNode(n), n]));

  const allNodes: Array<CompareNodeModel> = [];
  for (const baseNode of baseNodes) {
    const compareNode = compareNodesMap.get(getIdWithoutVersionFromNode(baseNode));
    if (compareNode) {
      allNodes.push({
        ...baseNode,
        compareVersion: compareNode.component.version,
        status: compareNode.component.id.isEqual(baseNode.component.id) ? 'unchanged' : 'modified',
      });
    } else {
      allNodes.push({
        ...baseNode,
        compareVersion: baseNode.component.version,
        status: 'deleted',
      });
    }
  }

  const newNodes = compareNodes.filter((n) => !baseNodesMap.has(getIdWithoutVersionFromNode(n)));

  for (const node of newNodes) {
    allNodes.push({
      ...node,
      compareVersion: '',
      status: 'new',
    });
  }
  const allNodesMap = new Map<string, CompareNodeModel>(allNodes.map((n) => [getIdWithoutVersionFromNode(n), n]));

  const baseEdgesMap = new Map<string, EdgeModel>(baseGraph.edges.map((baseEdge) => [getEdgeId(baseEdge), baseEdge]));
  const edgesOnlyInCompare = compareGraph.edges
    .filter((compareEdge) => !baseEdgesMap.has(getEdgeId(compareEdge)))
    .map((compareEdge) => ({
      ...compareEdge,
      sourceId:
        allNodesMap.get(getIdWithoutVersionFromNodeId(compareEdge.sourceId))?.id.toString() || baseId.toString(),
      targetId:
        allNodesMap.get(getIdWithoutVersionFromNodeId(compareEdge.targetId))?.id.toString() || baseId.toString(),
    }));
  const allEdges = [...baseGraph.edges, ...edgesOnlyInCompare];
  return new CompareGraphModel(allNodes, allEdges);
}

export function DependenciesCompare() {
  const graphRef = useRef<OnLoadParams>();
  const componentCompare = useComponentCompareContext();

  const baseId = componentCompare?.base?.id;
  const compareId = componentCompare?.compare?.id;

  const [filter, setFilter] = useState<GraphFilter>('runtimeOnly');
  const isFiltered = filter === 'runtimeOnly';
  const { loading: baseLoading, graph: baseGraph } = useGraphQuery(baseId && [baseId.toString()], filter);
  const { loading: compareLoading, graph: compareGraph } = useGraphQuery(compareId && [compareId.toString()], filter);
  const loading = baseLoading || compareLoading;
  const graph = buildGraph(baseGraph, compareGraph, baseId) ?? undefined;
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
    <div className={styles.page}>
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
          className={styles.graph}
          elements={elements}
          nodeTypes={NodeTypes}
          onLoad={handleLoad}
        >
          <Background />
          <Controls className={styles.controls} />
          <MiniMap nodeColor={calcMinimapColors} className={styles.minimap} />
          <GraphFilters
            className={styles.filters}
            disable={loading}
            isFiltered={isFiltered}
            onChangeFilter={onCheckFilter}
          />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
