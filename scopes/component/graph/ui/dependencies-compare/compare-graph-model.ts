import { EdgeModel, GraphModel } from '../query';
import { CompareNodeModel } from './compare-node-model';

export class CompareGraphModel extends GraphModel<CompareNodeModel, EdgeModel> {
  constructor(
    public nodes: CompareNodeModel[],
    public edges: EdgeModel[]
  ) {
    super(nodes, edges);
  }
}
