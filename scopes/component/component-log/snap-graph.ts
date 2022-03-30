import { Graph, Node, Edge } from '@teambit/graph.cleargraph';
import { ComponentLogInfo } from './component-log.main.runtime';

export function buildSnapGraph(componentLog: ComponentLogInfo[]) {
  const graph = new Graph<ComponentLogInfo, string>();
  // add nodes
  componentLog.forEach((snap) => {
    graph.setNode(new Node(snap.hash, snap));
  });
  // add edges
  componentLog.forEach((snap) => {
    snap.parents.forEach((parent) => {
      graph.setEdge(new Edge(snap.hash, parent, 'parent'));
    });
  });
  return graph;
}
