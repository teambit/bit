// @ts-nocheck
// the e2e runs inside the bit repo, where core-aspect types (e.g. @teambit/compiler) resolve
// to the repo sources while the env tree in the capsule brings the published @teambit/builder.
// the two BuildContext types are structurally identical but nominally different - skip checking.
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
