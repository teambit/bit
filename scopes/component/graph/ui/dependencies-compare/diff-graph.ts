import { ComponentID } from '@teambit/component';
import { EdgeModel, GraphModel, NodeModel } from '@teambit/graph';
import { CompareGraphModel } from './compare-graph-model';
import { CompareNodeModel } from './compare-node-model';

const toShortId = (node: NodeModel) => node.component.id.toStringWithoutVersion();

// this is to get a key with versions ignored so that we'll have a unique set of component nodes
const toShortIdFromNodeId = (nodeId: string) => nodeId.split('@')[0];

const delim = '::';

const getEdgeId = (_e: EdgeModel) => {
  return `${toShortIdFromNodeId(_e.sourceId)}${delim}${toShortIdFromNodeId(_e.targetId)}`;
};

export function diffGraph(
  baseGraph?: GraphModel<NodeModel, EdgeModel>,
  compareGraph?: GraphModel<NodeModel, EdgeModel>,
  baseId?: ComponentID
) {
  if (!baseGraph || !compareGraph || !baseId) return null;

  const baseNodes = baseGraph.nodes;
  const compareNodes = compareGraph.nodes;

  const baseNodesMap = new Map<string, NodeModel>(baseNodes.map((n) => [toShortId(n), n]));
  const compareNodesMap = new Map<string, NodeModel>(compareNodes.map((n) => [toShortId(n), n]));

  const allNodes: Array<CompareNodeModel> = [];
  for (const baseNode of baseNodes) {
    const compareNode = compareNodesMap.get(toShortId(baseNode));
    if (compareNode) {
      allNodes.push({
        ...baseNode,
        compareVersion: compareNode.component.version,
        status: compareNode.component.id.isEqual(baseNode.component.id) ? undefined : 'modified',
      });
    } else {
      allNodes.push({
        ...baseNode,
        compareVersion: baseNode.component.version,
        status: 'deleted',
      });
    }
  }

  const newNodes = compareNodes.filter((n) => !baseNodesMap.has(toShortId(n)));

  for (const node of newNodes) {
    allNodes.push({
      ...node,
      compareVersion: '',
      status: 'new',
    });
  }
  const allNodesMap = new Map<string, CompareNodeModel>(allNodes.map((n) => [toShortId(n), n]));

  const baseEdgesMap = new Map<string, EdgeModel>(baseGraph.edges.map((baseEdge) => [getEdgeId(baseEdge), baseEdge]));
  const edgesOnlyInCompare = compareGraph.edges
    .filter((compareEdge) => !baseEdgesMap.has(getEdgeId(compareEdge)))
    .map((compareEdge) => ({
      ...compareEdge,
      sourceId: allNodesMap.get(toShortIdFromNodeId(compareEdge.sourceId))?.id.toString() || baseId.toString(),
      targetId: allNodesMap.get(toShortIdFromNodeId(compareEdge.targetId))?.id.toString() || baseId.toString(),
    }));
  const allEdges = [...baseGraph.edges, ...edgesOnlyInCompare];
  return new CompareGraphModel(allNodes, allEdges);
}
