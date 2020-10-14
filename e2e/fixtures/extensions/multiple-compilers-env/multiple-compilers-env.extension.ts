import { EnvsMain, EnvsAspect } from '@teambit/environments';
import { ReactAspect, ReactMain } from '@teambit/react';
import { BabelAspect, BabelMain } from '@teambit/babel';
import type { CompilerMain } from '@teambit/compiler';
import { CompilerAspect } from '@teambit/compiler';

const babelConfig = require('./babel.config.json');
const tsconfig = require('./tsconfig.json');

export class MultipleCompilersEnv {
  constructor(private react: ReactMain) {}

  /**
   * icon of the extension.
   */
  icon() {
    return this.react.icon;
  }

  static dependencies: any = [EnvsAspect, ReactAspect, BabelAspect, CompilerAspect];

  static async provider([envs, react, babel, compiler]: [EnvsMain, ReactMain, BabelMain, CompilerMain]) {
    const compilerOverride = envs.override({
      getCompiler: () => {
        return babel.createCompiler({ babelTransformOptions: babelConfig })
      },
    });
    const buildPipeOverride = react.overrideBuildPipe([
      compiler.createTask('declarations', react.env.getCompiler()),
      ...react.env.getBuildPipe(),
    ]);

    const harmonyReactEnv = react.compose([
      react.overrideTsConfig(tsconfig),
      compilerOverride,
      buildPipeOverride
    ]);

    envs.registerEnv(harmonyReactEnv);
    return new MultipleCompilersEnv(react);
  }
}
