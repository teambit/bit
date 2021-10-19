import { DependenciesEnv } from '@teambit/envs';
import { VariantPolicyConfigObject } from '@teambit/dependency-resolver';
import { TypescriptMain } from '@teambit/typescript';

export class NodeEnv implements DependenciesEnv {
  constructor(private tsAspect: TypescriptMain) {}

  icon = 'https://static.bit.dev/extensions-icons/nodejs.svg';

  getDependencies(): VariantPolicyConfigObject {
    return {
      devDependencies: {
        '@types/jest': '26.0.20',
        '@types/node': '12.20.4',
        // This is added as dev dep since our jest file transformer uses babel plugins that require this to be installed
        '@babel/runtime': '7.12.18',
      },
    };
  }

  getPackageJsonProps() {
    return this.tsAspect.getPackageJsonProps();
  }
}
