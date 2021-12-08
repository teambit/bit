import { DependenciesEnv, CompilerEnv } from '@teambit/envs';
import { VariantPolicyConfigObject } from '@teambit/dependency-resolver';
import { ReactEnv } from '@teambit/react';

export class NodeEnv implements DependenciesEnv, CompilerEnv {
  constructor(private react: ReactEnv) {}

  icon = 'https://static.bit.dev/extensions-icons/nodejs.svg';

  getCompiler() {
    return this.react.getCompiler();
  }

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
}
