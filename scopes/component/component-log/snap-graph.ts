import { Graph } from 'cleargraph';
import { ComponentLogInfo } from './component-log.main.runtime';

export function buildSnapGraph(componentLog: ComponentLogInfo[]) {
  const graph = new Graph<ComponentLogInfo, string>();
  // add nodes
  componentLog.forEach((snap) => {
    graph.setNode(snap.hash, snap);
  });
  // add edges
  componentLog.forEach((snap) => {
    snap.parents.forEach((parent) => {
      graph.setEdge(snap.hash, parent, 'parent');
    });
  });
  return graph;
}
