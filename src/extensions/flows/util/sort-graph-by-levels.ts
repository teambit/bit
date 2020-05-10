import { Graph, alg } from 'graphlib';

type Level = {
  inEdgeCount: number;
  edges: string[];
};

export function toposortByLevels(graph: Graph) {
  return alg
    .topsort(graph)
    .reduce((accum: Array<Level>, curr) => {
      const inEdges = graph.inEdges(curr);
      if (!accum.length) {
        accum.push({
          inEdgeCount: inEdges ? inEdges.length : 0,
          edges: [curr]
        });
        return accum;
      }
      if (!inEdges) {
        return accum;
      }
      const prevInEdges = accum[accum.length - 1].inEdgeCount;
      if (inEdges.length === prevInEdges) {
        accum[accum.length - 1].edges.push(curr);
      } else {
        accum.push({
          inEdgeCount: inEdges.length,
          edges: [curr]
        });
      }
      return accum;
    }, [])
    .map(level => level.edges);
}
