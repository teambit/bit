import { BabelMain } from '@teambit/babel';
import { CompilerAspect, CompilerMain } from '@teambit/compiler';
import { Environment } from '@teambit/envs';
import { merge } from 'lodash';
import { TsConfigSourceFile } from 'typescript';
import { ReactEnv } from '@teambit/react';
import { babelConfig } from './babel/babel-config';

const tsconfig = require('./typescript/tsconfig.json');

export const AspectEnvType = 'aspect';

/**
 * a component environment built for [Aspects](https://reactjs.org) .
 */
export class AspectEnv implements Environment {
  constructor(private reactEnv: ReactEnv, private babel: BabelMain, private compiler: CompilerMain) {}

  icon = 'https://static.bit.dev/extensions-icons/default.svg';

  async __getDescriptor() {
    return {
      type: AspectEnvType,
    };
  }

  async getDependencies() {
    return {
      dependencies: {
        'core-js': '^3.6.5',
        '@babel/runtime': '^7.8.4',
      },
    };
  }

  getTsConfig(tsConfig: TsConfigSourceFile) {
    const targetConf = merge(tsconfig, tsConfig);
    return targetConf;
  }

  getCompiler() {
    return this.babel.createCompiler({ babelTransformOptions: babelConfig });
  }

  createTsCompiler(tsConfig: TsConfigSourceFile) {
    return this.reactEnv.getCompiler(this.getTsConfig(tsConfig));
  }

  getBuildPipe() {
    const tsCompiler = this.reactEnv.getCompiler(tsconfig, {
      artifactName: 'declaration',
      distGlobPatterns: [`dist/**/*.d.ts`],
      shouldCopyNonSupportedFiles: false,
    });

    const babelCompiler = this.babel.createCompiler({ babelTransformOptions: babelConfig });

    const pipeWithoutCompiler = this.reactEnv.getBuildPipe().filter((task) => task.aspectId !== CompilerAspect.id);

    return [
      this.compiler.createTask('BabelCompiler', babelCompiler), // for dists
      this.compiler.createTask('TypescriptCompiler', tsCompiler), // for d.ts files
      ...pipeWithoutCompiler,
    ];
  }
}
