import { EnvsMain, EnvsAspect } from '@teambit/envs';
import { ReactAspect, ReactMain } from '@teambit/react';
import { BabelAspect, BabelMain } from '@teambit/babel';
import { CompilerAspect, CompilerMain } from '@teambit/compiler';

const  babelConfig = require('./babel.config.json');

export class BabelEnv {
  constructor(private react: ReactMain) {}

  static dependencies: any = [EnvsAspect, ReactAspect, BabelAspect, CompilerAspect];

  static async provider([envs, react, babel, compiler]: [EnvsMain, ReactMain, BabelMain, CompilerMain]) {
    const babelCompiler = babel.createCompiler({ babelTransformOptions: babelConfig });

    const harmonyReactEnv = react.compose([
      react.overrideCompiler(babelCompiler),
      react.overrideCompilerTasks([compiler.createTask('BabelCompiler', babelCompiler)])
    ]);

    envs.registerEnv(harmonyReactEnv);
    return new BabelEnv(react);
  }
}
