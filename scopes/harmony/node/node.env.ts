import { DependenciesEnv } from '@teambit/envs';
import { VariantPolicyConfigObject } from '@teambit/dependency-resolver';

export class NodeEnv implements DependenciesEnv {
  icon = 'https://static.bit.dev/extensions-icons/nodejs.svg';

  getDependencies(): VariantPolicyConfigObject {
    return {
      devDependencies: {
        '@types/jest': '26.0.20',
      },
    };
  }
}
