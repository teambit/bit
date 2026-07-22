// @ts-nocheck
// the e2e runs inside the bit repo, where core-aspect types (e.g. @teambit/envs) resolve to the
// repo sources while the env tree in the capsule brings the published packages. the types are
// structurally identical but nominally different - skip checking.
import { EnvsMain, EnvsAspect } from '@teambit/envs';
import { NodeMain, NodeAspect } from '@teambit/node';

export class NodeEnv {
  constructor(private node: NodeMain) {}

  static dependencies: any = [EnvsAspect, NodeAspect];

  static async provider([envs, node]: [EnvsMain, NodeMain]) {

    const nodeEnv = node.compose([]);

    nodeEnv.getDependencies = () => {
      return {
        devDependencies: {
          "is-positive": "1.0.0"
        },
      };
    }

    envs.registerEnv(nodeEnv);
    return new NodeEnv(node);
  }
}
