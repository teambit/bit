import { BabelMain } from '@teambit/babel';
import type { BuildTask } from '@teambit/builder';
import { CompilerMain } from '@teambit/compiler';
import { Environment } from '@teambit/environments';
import { PkgMain } from '@teambit/pkg';
// import { merge } from 'lodash';
import { ReactEnv } from '@teambit/react';
import { TesterMain } from '@teambit/tester';
import { babelConfig } from './babel/babel-config';

const tsconfig = require('./typescript/tsconfig.json');

export const AspectEnvType = 'aspect';

/**
 * a component environment built for [Aspects](https://reactjs.org) .
 */
export class AspectEnv implements Environment {
  constructor(
    private reactEnv: ReactEnv,
    private babel: BabelMain,
    private compiler: CompilerMain,
    private tester: TesterMain,
    private pkg: PkgMain
  ) {}

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
      },
    };
  }

  getCompiler() {
    // return this.reactEnv.getCompiler(tsconfig);
    return this.babel.createCompiler({ babelTransformOptions: babelConfig });
  }

  getBuildPipe(): BuildTask[] {
    const tsCompiler = this.reactEnv.getCompiler(tsconfig);
    tsCompiler.distDir = 'dist';
    tsCompiler.artifactName = 'declaration';
    tsCompiler.distGlobPatterns = [`${tsCompiler.distDir}/**/*.d.ts`];
    tsCompiler.shouldCopyNonSupportedFiles = false;

    const babelCompiler = this.babel.createCompiler({ babelTransformOptions: babelConfig });
    babelCompiler.distDir = 'dist';
    babelCompiler.distGlobPatterns = [`${babelCompiler.distDir}/**`, `!${babelCompiler.distDir}/**/*.d.ts`];

    return [
      this.compiler.createTask('BabelCompiler', babelCompiler), // for dists
      this.compiler.createTask('TypescriptCompiler', tsCompiler), // for d.ts files
      this.tester.task,
      this.pkg.preparePackagesTask,
      this.pkg.dryRunTask,
    ];
  }
}
