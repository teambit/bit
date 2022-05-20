import { ComponentID } from '@teambit/component';
import { useComponentCompareContext } from '@teambit/component.ui.component-compare';
import { EdgeModel, EdgeType, GraphModel, NodeModel, useGraphQuery } from '@teambit/graph';
import dagre, { graphlib } from 'dagre';
import React from 'react';
import ReactFlow, {
  ArrowHeadType,
  Background,
  Controls,
  Edge,
  Handle,
  Node,
  NodeProps,
  NodeTypesType,
  Position,
  ReactFlowProvider,
} from 'react-flow-renderer';
import { CompareGraphModel } from './compare-graph-model';
import { CompareNodeModel } from './compare-node-model';
import { ComponentCompareDependencyNode } from './component-compare-dependency-node';
import styles from './component-compare-dependencies.module.scss';

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

export function ComponentCompareDependencies() {
  const componentCompare = useComponentCompareContext();

  if (componentCompare === undefined) {
    return <></>;
  }

  const { base: baseComponent, compare: compareComponent } = componentCompare;
  const { id: baseId } = baseComponent;
  const { id: compareId } = compareComponent;
  const filter = 'runtimeOnly'; // this controls the checkbox to show/hide runtime nodes
  const { graph: baseGraph } = useGraphQuery([baseId.toString()], filter);
  const { graph: compareGraph } = useGraphQuery([compareId.toString()], filter);

  if (!baseGraph || !compareGraph) {
    return <></>;
  }

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
          status: 'removed',
        });
      }
    }

    const newNodes = compareNodes.filter((n) => !baseNodesMap.has(n.component.id.toStringWithoutVersion()));
    for (const node of newNodes) {
      allNodes.push({
        ...node,
        compareVersion: node.component.version,
        status: 'added',
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

  const graph = buildGraph(baseGraph, compareGraph);

  const elements = calcElements(graph, baseId.toString(), compareId.toString());

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
        >
          <Background />
          <Controls className={styles.controls} />
          {/* <MiniMap nodeColor={calcMinimapColors} className={styles.minimap} /> */}
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}

// todo: move to new file
const NODE_WIDTH = 260;
const NODE_HEIGHT = 90;

const BOTTOM_TO_TOP = 'BT';

/**
 * calculate the specific location of each node in the graph
 */
export function calcLayout(graph: CompareGraphModel) {
  const g = new graphlib.Graph();
  g.setGraph({ rankdir: BOTTOM_TO_TOP });
  g.setDefaultEdgeLabel(() => ({}));

  // make a new instance of { width, height } per node, or dagre will get confused and place all nodes in the same spot
  graph.nodes.forEach((n) => g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));
  graph.edges.forEach((e) => g.setEdge({ v: e.sourceId, w: e.targetId }));

  // position items in graph
  dagre.layout(g);

  const positionsArr: [string, { x: number; y: number }][] = g.nodes().map((nodeId) => {
    const node = g.node(nodeId);

    const pos = {
      x: node.x - node.width / 2,
      y: node.y - node.height / 2,
    };

    return [nodeId, pos];
  });

  return new Map(positionsArr);
}

function calcElements(graph: CompareGraphModel, baseId: string, compareId: string) {
  if (!graph) return [];

  const positions = calcLayout(graph);

  const nodes: Node[] = Array.from(graph.nodes.values()).map((x) => {
    const rootNode = x.id === baseId || x.id === compareId ? ComponentID.fromString(x.id) : undefined;
    return {
      id: x.id,
      type: 'ComponentNode',
      data: {
        node: x,
        type: rootNode && x.component.id.isEqual(rootNode, { ignoreVersion: true }) ? 'root' : undefined,
      },
      position: positions.get(x.id) || { x: 0, y: 0 },
    };
  });

  const edges: Edge[] = graph.edges.map((e) => ({
    id: `_${e.sourceId}__${e.targetId}`,
    source: e.sourceId,
    target: e.targetId,
    label: depTypeToLabel(e.dependencyLifecycleType),
    labelBgPadding: [4, 4],
    type: 'smoothstep',
    className: depTypeToClass(e.dependencyLifecycleType),
    arrowHeadType: ArrowHeadType.Arrow,
  }));

  return [...nodes, ...edges];
}

// todo: should be able to reuse from scopes/component/graph/ui/dependencies-graph/dep-edge/dep-edge.tsx
export function depTypeToClass(depType: string) {
  switch (depType) {
    case 'DEV':
      return styles.dev;
    case 'PEER':
      return styles.peer;
    case 'RUNTIME':
      return styles.runtime;
    default:
      return undefined;
  }
}

export function depTypeToLabel(type: EdgeType) {
  switch (type) {
    case EdgeType.peer:
      return 'Peer Dependency';
    case EdgeType.dev:
      return 'Development Dependency';
    case EdgeType.runtime:
      return 'Dependency';
    default:
      return (type as string).toLowerCase();
  }
}
