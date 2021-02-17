import { BitIdStr } from '@teambit/legacy-bit-id';
import logger from '@teambit/legacy/dist/logger/logger';
import { alg, Graph } from 'graphlib';

type Level = {
  inEdgeCount: number;
  edges: string[];
};

export function toposortByLevels(graph: Graph, throwForCycles = false): Array<BitIdStr[]> {
  // @todo: @qballer, once you implement the option to not sort the graph, revisit the throwForCycles arg
  const cycles = alg.findCycles(graph);
  if (cycles.length) {
    // impossible to topsort
    if (throwForCycles) {
      throw new Error(`fatal: graphlib was unable to topsort the components. circles: ${cycles}`);
    }
    logger.warn(`unable to topsort. cycles: ${cycles}`);
    return [graph.nodes()]; // all nodes on the same level
  }

  return getGraphSorted(graph)
    .reduce((accum: Array<Level>, curr) => {
      const inEdges = graph.inEdges(curr);
      if (!accum.length) {
        accum.push({
          inEdgeCount: inEdges ? inEdges.length : 0,
          edges: [curr],
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
          edges: [curr],
        });
      }
      return accum;
    }, [])
    .map((level) => level.edges);
}

function getGraphSorted(graph: Graph): string[] {
  try {
    return alg.topsort(graph);
  } catch (err) {
    // should never arrive here, it's just a precaution, as topsort doesn't fail nicely
    logger.error(err);
    throw new Error(`fatal: graphlib was unable to topsort the components. ${err.toString()}`);
  }
}
