import type { EdgeModel } from '../query';
import { GraphModel } from '../query';
import type { CompareNodeModel } from './compare-node-model';

export class CompareGraphModel extends GraphModel<CompareNodeModel, EdgeModel> {
  constructor(
    public nodes: CompareNodeModel[],
    public edges: EdgeModel[]
  ) {
    super(nodes, edges);
  }
}
