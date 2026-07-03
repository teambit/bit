import { EnvsMain, EnvsAspect } from '@teambit/envs';
import { AspectMain, AspectAspect } from '@teambit/aspect';

export class NodeEnv {
  constructor(private aspect: AspectMain) {}

  static dependencies: any = [EnvsAspect, AspectAspect];

  static async provider([envs, aspect]: [EnvsMain, AspectMain]) {
    // compose on top of the core aspect env. (node/react are no longer core aspects, using them
    // would require installing them first). override the descriptor type so components using this
    // env are not treated as aspects.
    const nodeEnv = aspect.compose([], {
      async __getDescriptor() {
        return { type: 'node' };
      },
    });

    envs.registerEnv(nodeEnv);
    return new NodeEnv(aspect);
  }
}
