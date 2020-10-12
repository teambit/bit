import { RawGraph } from './get-graph.query';
import { NodeModel } from './node-model';
import { EdgeModel } from './edge-model';

export class GraphModel {
  constructor(public nodes: NodeModel[], public edges: EdgeModel[]) {}
  static from(rawGraph: RawGraph) {
    const nodes = rawGraph.nodes.map(NodeModel.from);
    const edges = rawGraph.edges.map(EdgeModel.from);
    return new GraphModel(nodes, edges);
  }
}
