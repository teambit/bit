import { EnvsMain, EnvsAspect } from '@teambit/envs';
import { NodeMain, NodeAspect } from '@teambit/node';

export class NodeEnv {
  constructor(private node: NodeMain) {}

  static dependencies: any = [EnvsAspect, NodeAspect];

  static async provider([envs, node]: [EnvsMain, NodeMain]) {


    const nodeEnv = node.compose([]);

    envs.registerEnv(nodeEnv);
    return new NodeEnv(node);
  }
}
