import { BabelMain } from '@teambit/babel';
import { CompilerAspect, CompilerMain, Compiler } from '@teambit/compiler';
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

  getTsConfig(tsConfig: TsConfigSourceFile) {
    const targetConf = merge(tsconfig, tsConfig);
    return targetConf;
  }

  getCompiler() {
    return this.babel.createCompiler({ babelTransformOptions: babelConfig });
  }

  createTsCompiler(tsConfig: TsConfigSourceFile): Compiler {
    return this.reactEnv.getCompiler(this.getTsConfig(tsConfig));
  }

  getBuildPipe() {
    const tsCompiler = this.reactEnv.createTsCompiler(tsconfig, {
      artifactName: 'declaration',
      distGlobPatterns: [`dist/**/*.d.ts`],
      shouldCopyNonSupportedFiles: false,
    });

    const babelCompiler = this.babel.createCompiler({ babelTransformOptions: babelConfig });

    const pipeWithoutCompiler = this.reactEnv.getBuildPipe().filter((task) => task.aspectId !== CompilerAspect.id);

    return [
      this.compiler.createTask('TypescriptCompiler', tsCompiler), // for d.ts files
      this.compiler.createTask('BabelCompiler', babelCompiler), // for dists
      ...pipeWithoutCompiler,
    ];
  }
}
