import { useComponentCompareContext } from '@teambit/component.ui.component-compare';
import { EdgeModel, GraphModel, NodeModel, useGraphQuery } from '@teambit/graph';
import React from 'react';
import { CompareNodeModel } from './compare-node-model';
import { ComponentCompareDependencyNode } from './component-compare-dependency-node';

export function ComponentCompareDependencies() {
  const componentCompare = useComponentCompareContext();

  if (componentCompare === undefined) {
    return <></>;
  }

  const { base: baseComponent, compare: compareComponent } = componentCompare;
  const { id: baseId, version: baseVersion } = baseComponent;
  const { id: compareId, version: compareVersion } = compareComponent;
  const { graph: baseGraph } = useGraphQuery([baseId.toString()]);
  const { graph: compareGraph } = useGraphQuery([compareId.toString()]);

  if (baseGraph === undefined || compareGraph === undefined) {
    return <></>;
  }

  function buildGraph(baseGraph: GraphModel, compareGraph: GraphModel) {
    const baseNodes = baseGraph.nodes;
    const compareNodes = compareGraph.nodes;
    const baseNodesMap = new Map<string, NodeModel>(baseNodes.map((n) => [n.id, n]));
    const compareNodesMap = new Map<string, NodeModel>(compareNodes.map((n) => [n.id, n]));

    const allNodes: Array<CompareNodeModel> = [];
    for (let baseNode of baseNodes) {
      const compareNode = compareNodesMap.get(baseNode.id);
      if (!!compareNode) {
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

    const newNodes = compareNodes.filter((n) => !baseNodesMap.has(n.id));
    for (let node of newNodes) {
      allNodes.push({
        ...node,
        compareVersion: node.component.version,
        status: 'added',
      });
    }
    
    // todo: why comparing key tuples not working?
    // const baseEdgesMap = new Map<[string, string], EdgeModel>(baseGraph.edges.map((e) => [[e.sourceId, e.targetId], e]));
    // const edgesRemovedFromBase = compareGraph.edges.filter((e) => !baseEdgesMap.has([e.sourceId, e.targetId]));
    
    const baseEdgesMap = new Map<string, EdgeModel>(baseGraph.edges.map((e) => [`${e.sourceId} | ${e.targetId}`, e]));
    const edgesOnlyInCompare = compareGraph.edges.filter((e) => !baseEdgesMap.has(`${e.sourceId} | ${e.targetId}`));
    // console.log(baseEdgesMap.size, edgesOnlyInCompare.length);
    const allEdges = [...baseGraph.edges, ...edgesOnlyInCompare];
    
    console.log({ allNodes, allEdges });

  }

  const graph = buildGraph(baseGraph, compareGraph);

  return (
    <>
      <div>Hello Dependencies</div>
      <br />
      <ComponentCompareDependencyNode />
    </>
  );
}
