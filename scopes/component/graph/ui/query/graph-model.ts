import { RawGraph } from './get-graph.query';
import { NodeModel } from './node-model';
import { EdgeModel } from './edge-model';

export class GraphModel<N extends NodeModel, E extends EdgeModel> {
  constructor(public nodes: N[], public edges: E[]) {}

  static from(rawGraph: RawGraph) {
    const nodes = rawGraph.nodes.map(NodeModel.from);
    const edges = rawGraph.edges.map(EdgeModel.from);
    return new GraphModel(nodes, edges);
  }
}
