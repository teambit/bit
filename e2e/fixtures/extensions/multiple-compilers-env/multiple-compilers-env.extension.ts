import { EnvsMain, EnvsAspect } from '@teambit/envs';
import { ReactAspect, ReactMain } from '@teambit/react';
import { BabelAspect, BabelMain } from '@teambit/babel';
import type { CompilerMain } from '@teambit/compiler';
import { CompilerAspect } from '@teambit/compiler';
import { TsConfigTransformer } from '@teambit/typescript';
import { TypescriptConfigMutator } from '@teambit/typescript.modules.ts-config-mutator';

const babelConfig = require('./babel.config.json');
const tsconfig = require('./tsconfig.json');

export class MultipleCompilersEnv {
  constructor(private react: ReactMain) {}

  static dependencies: any = [EnvsAspect, ReactAspect, BabelAspect, CompilerAspect];

  static async provider([envs, react, babel, compiler]: [EnvsMain, ReactMain, BabelMain, CompilerMain]) {
    const babelCompiler = babel.createCompiler(
      {
        babelTransformOptions: babelConfig,
        distDir: 'dist',
        distGlobPatterns: [`dist/**`, `!dist/**/*.d.ts`, `!dist/tsconfig.tsbuildinfo`]
      });
    const compilerOverride = envs.override({
      getCompiler: () => {
        return babelCompiler;
      },
    });

    const transformer: TsConfigTransformer = (config: TypescriptConfigMutator) => {
      config
        .mergeTsConfig(tsconfig)
        .setArtifactName('declaration')
        .setDistGlobPatterns([`dist/**/*.d.ts`])
        .setShouldCopyNonSupportedFiles(false);
      return config;
    };
    const tsCompiler = react.env.getCompiler([transformer]);

    const buildPipeOverride = react.overrideBuildPipe([
      compiler.createTask('BabelCompiler', babelCompiler),
      compiler.createTask('TypescriptCompiler', tsCompiler),
    ]);

    const harmonyReactEnv = react.compose([
      compilerOverride,
      buildPipeOverride
    ]);

    envs.registerEnv(harmonyReactEnv);
    return new MultipleCompilersEnv(react);
  }
}
