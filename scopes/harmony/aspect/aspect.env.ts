import { Compiler } from '@teambit/compiler';
import { DependenciesEnv } from '@teambit/envs';
import { merge } from 'lodash';
import { TsConfigSourceFile } from 'typescript';
import { ReactEnv } from '@teambit/react';

const tsconfig = require('./typescript/tsconfig.json');

export const AspectEnvType = 'aspect';

/**
 * a component environment built for [Aspects](https://reactjs.org) .
 */
export class AspectEnv implements DependenciesEnv {
  constructor(private reactEnv: ReactEnv) {}

  icon = 'https://static.bit.dev/extensions-icons/default.svg';

  async __getDescriptor() {
    return {
      type: AspectEnvType,
    };
  }

  getTsConfig(tsConfig: TsConfigSourceFile) {
    const targetConf = merge(tsconfig, tsConfig);
    return targetConf;
  }

  createTsCompiler(tsConfig: TsConfigSourceFile): Compiler {
    return this.reactEnv.getCompiler(this.getTsConfig(tsConfig));
  }

  async getDependencies() {
    return {
      dependencies: {
        react: '-',
        'react-dom': '-',
        'core-js': '^3.0.0',
        // For aspects the babel runtime should be a runtime dep not only dev as they are compiled by babel
        '@babel/runtime': '7.12.18',
      },
      // TODO: add this only if using ts
      devDependencies: {
        react: '-',
        'react-dom': '-',
        '@types/mocha': '-',
        '@types/node': '12.20.4',
        '@types/react': '^17.0.8',
        '@types/react-dom': '^17.0.5',
        '@types/jest': '^26.0.0',
        '@types/testing-library__jest-dom': '5.9.5',
      },
      peerDependencies: {
        // TODO: check if we really need react for aspects (maybe for ink support)
        react: '^16.8.0 || ^17.0.0',
        'react-dom': '^16.8.0 || ^17.0.0',
      },
    };
  }
}
