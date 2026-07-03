import { EnvsMain, EnvsAspect } from '@teambit/envs';
import { AspectMain, AspectAspect } from '@teambit/aspect';

export class AddDepsEnv {
  constructor(private aspect: AspectMain) {}

  static dependencies: any = [EnvsAspect, AspectAspect];

  static async provider([envs, aspect]: [EnvsMain, AspectMain]) {
    // compose on top of the core aspect env. (node/react are no longer core aspects, using them
    // would require installing them first). override the descriptor type so components using this
    // env are not treated as aspects.
    const addDepsEnv = aspect.compose(
      [
        aspect.overrideDependencies({
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
      ],
      {
        async __getDescriptor() {
          return { type: 'node' };
        },
      }
    );

    envs.registerEnv(addDepsEnv);
    return new AddDepsEnv(aspect);
  }
}
