import { EnvsMain, EnvsAspect } from '@teambit/envs';
import { AspectMain, AspectAspect } from '@teambit/aspect';

export class DevFilesEnv {
  constructor(private aspect: AspectMain) {}

  static dependencies: any = [EnvsAspect, AspectAspect];

  static async provider([envs, aspect]: [EnvsMain, AspectMain]) {
    // compose on top of the core aspect env. (node/react are no longer core aspects, using them
    // would require installing them first). override the descriptor type so components using this
    // env are not treated as aspects.
    const devFilesEnv = aspect.compose(
      [
        envs.override({
          getTestsDevPatterns: () => ['**/*.registered-test.spec.+(js|ts|jsx|tsx)', '**/*.registered-test.test.+(js|ts|jsx|tsx)'],
          getDocsDevPatterns: () => ['**/*.custom-docs-suffix.*'],
          getCompositionsDevPatterns: () => ['**/*.custom-composition?(s)-suffix.*'],
          getDevPatterns: () => ['**/*.custom-dev-file.*']
        }),
      ],
      {
        async __getDescriptor() {
          return { type: 'node' };
        },
      }
    );

    envs.registerEnv(devFilesEnv);
    return new DevFilesEnv(aspect);
  }
}
