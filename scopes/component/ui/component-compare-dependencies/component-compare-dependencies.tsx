import { useComponentCompareContext } from '@teambit/component.ui.component-compare';
import { calcMinimapColors, EdgeModel, GraphModel, NodeModel, useGraphQuery, GraphFilters, GraphFilter } from '@teambit/graph';
import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { calcElements } from './calc-elements';
import { CompareGraphModel } from './compare-graph-model';
import { CompareNodeModel } from './compare-node-model';
import styles from './component-compare-dependencies.module.scss';
import { ComponentCompareDependencyNode } from './component-compare-dependency-node';

function ComponentNodeContainer(props: NodeProps) {
  const { sourcePosition = Position.Top, targetPosition = Position.Bottom, data, id } = props;

  return (
    <div key={id}>
      <Handle type="target" position={targetPosition} isConnectable={false} />
      <Handle type="source" position={sourcePosition} isConnectable={false} />
      <ComponentCompareDependencyNode node={data.node} type={data.type} />
    </div>
  );
}

const NodeTypes: NodeTypesType = { ComponentNode: ComponentNodeContainer };

function buildGraph(_baseGraph: GraphModel, _compareGraph: GraphModel) {
  const baseNodes = _baseGraph.nodes;
  const compareNodes = _compareGraph.nodes;
  const baseNodesMap = new Map<string, NodeModel>(baseNodes.map((n) => [n.component.id.toStringWithoutVersion(), n]));
  const compareNodesMap = new Map<string, NodeModel>(
    compareNodes.map((n) => [n.component.id.toStringWithoutVersion(), n])
  );

  const allNodes: Array<CompareNodeModel> = [];
  for (const baseNode of baseNodes) {
    const compareNode = compareNodesMap.get(baseNode.component.id.toStringWithoutVersion());
    if (compareNode) {
      allNodes.push({
        ...baseNode,
        compareVersion: compareNode.component.version,
        status: compareNode.component.version === baseNode.component.version ? 'unchanged' : 'modified',
      });
    } else {
      allNodes.push({
        ...baseNode,
        compareVersion: baseNode.component.version,
        status: 'deleted',
      });
    }
  }

  const newNodes = compareNodes.filter((n) => !baseNodesMap.has(n.component.id.toStringWithoutVersion()));
  for (const node of newNodes) {
    allNodes.push({
      ...node,
      compareVersion: node.component.version,
      status: 'new',
    });
  }

  const baseEdgesMap = new Map<string, EdgeModel>(
    _baseGraph.edges.map((e) => [`${e.sourceId.split('@')[0]} | ${e.targetId.split('@')[0]}`, e])
  );
  const edgesOnlyInCompare = _compareGraph.edges.filter(
    (e) => !baseEdgesMap.has(`${e.sourceId.split('@')[0]} | ${e.targetId.split('@')[0]}`)
  );
  const allEdges = [..._baseGraph.edges, ...edgesOnlyInCompare];

  return new CompareGraphModel(allNodes, allEdges);
}

export function ComponentCompareDependencies() {
  const graphRef = useRef<OnLoadParams>();
  const componentCompare = useComponentCompareContext();

  if (componentCompare === undefined) {
    return <></>;
  }

  const {
    base: { id: baseId },
    compare: { id: compareId },
  } = componentCompare;
  const [filter, setFilter] = useState<GraphFilter>('runtimeOnly');
  const isFiltered = filter === 'runtimeOnly';
  const { loading: baseLoading, graph: baseGraph } = useGraphQuery([baseId.toString()], filter);
  const { loading: compareLoading, graph: compareGraph } = useGraphQuery([compareId.toString()], filter);
  const loading = baseLoading || compareLoading;

  if (!baseLoading && !compareLoading) {
    if (!baseGraph || !compareGraph) {
      return <></>;
    }
  }

  let graph: CompareGraphModel | undefined = undefined;
  if (!!baseGraph && !!compareGraph) {
    graph = buildGraph(baseGraph, compareGraph);
  }

  const elements = useMemo(() => {
    if (!!graph) {
      return calcElements(graph, baseId.toString(), compareId.toString());
    }
    return [];
  }, [graph]);

  useEffect(() => {
    graphRef.current?.fitView();
  }, [elements]);

  function handleLoad(instance: OnLoadParams) {
    graphRef.current = instance;
    graphRef.current?.fitView();
  }

  const onCheckFilter = (isFiltered: boolean) => {
    setFilter(isFiltered ? 'runtimeOnly' : undefined);
  };

  return (
    <div className={styles.page}>
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
