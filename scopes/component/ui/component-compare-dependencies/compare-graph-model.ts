import { EdgeModel, GraphModel, RawGraph, NodeModel } from '@teambit/graph';
import { CompareNodeModel } from './compare-node-model';

export class CompareGraphModel extends GraphModel {
  constructor(public nodes: CompareNodeModel[], public edges: EdgeModel[]) {
    super(nodes, edges);
  }

  static fromCompareNodeModels(nodes: Array<CompareNodeModel>, edges: Array<EdgeModel>) {
    return new CompareGraphModel(nodes, edges);
  }

  static from(rawGraph: RawGraph) {
    const nodes = rawGraph.nodes.map(NodeModel.from);
    const edges = rawGraph.edges.map(EdgeModel.from);
    return new GraphModel(nodes, edges);
  }
}
