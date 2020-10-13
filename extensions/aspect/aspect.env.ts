import { BabelMain } from '@teambit/babel';
import { Environment } from '@teambit/environments';
import { ReactEnv } from '@teambit/react';
import { babelConfig } from './babel/babel-config';

const tsconfig = require('./typescript/tsconfig.json');

export const AspectEnvType = 'aspect';

/**
 * a component environment built for [Aspects](https://reactjs.org) .
 */
export class AspectEnv implements Environment {
  constructor(private reactEnv: ReactEnv, private babel: BabelMain) {}

  async __getDescriptor() {
    return {
      type: AspectEnvType,
    };
  }

  async getDependencies() {
    return {
      dependencies: {
        'core-js': '^3.6.5',
      },
    };
  }

  getCompiler() {
    // return this.reactEnv.getCompiler(tsconfig);
    return this.babel.createCompiler({ babelTransformOptions: babelConfig });
  }
}
