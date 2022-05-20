import { EdgeModel } from '@teambit/graph';
import { CompareNodeModel } from './compare-node-model';

export class CompareGraphModel {
  constructor(public nodes: CompareNodeModel[], public edges: EdgeModel[]) {}

  static from(nodes: Array<CompareNodeModel>, edges: Array<EdgeModel>) {
    return new CompareGraphModel(nodes, edges);
  }
}
