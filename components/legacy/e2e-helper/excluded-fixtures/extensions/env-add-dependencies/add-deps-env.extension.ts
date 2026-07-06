import { EnvsMain, EnvsAspect } from '@teambit/envs';
import { NodeMain, NodeAspect } from '@teambit/node';

export class AddDepsEnv {
  constructor(private node: NodeMain) {}

  static dependencies: any = [EnvsAspect, NodeAspect];

  static async provider([envs, node]: [EnvsMain, NodeMain]) {
    const addDepsEnv = node.compose([
      node.overrideDependencies({
        devDependencies: {
          "lodash.get": "4.4.2"
        },
        peers: [
          {
            name: "lodash.zip",
            version: '4.2.0',
            supportedRange: '^4.0.0'
          }]
      })
    ]);

    envs.registerEnv(addDepsEnv);
    return new AddDepsEnv(node);
  }
}
