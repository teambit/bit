import { EnvsMain, EnvsAspect } from '@teambit/envs';
import { NodeMain, NodeAspect } from '@teambit/node';

export class DevFilesEnv {
  constructor(private node: NodeMain) {}

  static dependencies: any = [EnvsAspect, NodeAspect];

  static async provider([envs, node]: [EnvsMain, NodeMain]) {

    const devFilesEnv = node.compose([
      envs.override({
        getTestsDevPatterns: () => ['**/*.registered-test.spec.+(js|ts|jsx|tsx)', '**/*.registered-test.test.+(js|ts|jsx|tsx)'],
        getDocsDevPatterns: () => ['**/*.custom-docs-suffix.*'],
        getCompositionsDevPatterns: () => ['**/*.custom-composition?(s)-suffix.*'],
        getDevPatterns: () => ['**/*.custom-dev-file.*']
      }),
    ]);

    envs.registerEnv(devFilesEnv);
    return new DevFilesEnv(node);
  }
}
