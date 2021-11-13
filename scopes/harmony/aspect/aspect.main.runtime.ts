import { AspectLoaderAspect, AspectLoaderMain } from '@teambit/aspect-loader';
import { BuilderAspect, BuilderMain } from '@teambit/builder';
import { MainRuntime } from '@teambit/cli';
import { EnvsAspect, EnvsMain, EnvTransformer } from '@teambit/envs';
import { ReactAspect, ReactMain } from '@teambit/react';
import { GeneratorAspect, GeneratorMain } from '@teambit/generator';
import { BabelAspect, BabelMain } from '@teambit/babel';
import { CompilerAspect, CompilerMain } from '@teambit/compiler';
import { AspectAspect } from './aspect.aspect';
import { AspectEnv } from './aspect.env';
import { CoreExporterTask } from './core-exporter.task';
import { aspectTemplate } from './templates/aspect';
import { babelConfig } from './babel/babel-config';

const tsconfig = require('./typescript/tsconfig.json');

export class AspectMain {
  constructor(readonly aspectEnv: AspectEnv, private envs: EnvsMain) {}

  /**
   * compose your own aspect environment.
   */
  compose(transformers: EnvTransformer[] = []) {
    return this.envs.compose(this.aspectEnv, transformers);
  }

  static runtime = MainRuntime;
  static dependencies = [
    ReactAspect,
    EnvsAspect,
    BuilderAspect,
    AspectLoaderAspect,
    CompilerAspect,
    BabelAspect,
    GeneratorAspect,
  ];

  static async provider([react, envs, builder, aspectLoader, compiler, babel, generator]: [
    ReactMain,
    EnvsMain,
    BuilderMain,
    AspectLoaderMain,
    CompilerMain,
    BabelMain,
    GeneratorMain
  ]) {
    const babelCompiler = babel.createCompiler({
      babelTransformOptions: babelConfig,
      distDir: 'dist',
      distGlobPatterns: [`dist/**`, `!dist/**/*.d.ts`, `!dist/tsconfig.tsbuildinfo`],
    });
    const compilerOverride = envs.override({
      getCompiler: () => {
        return babelCompiler;
      },
    });

    const transformer = (config) => {
      config
        .mergeTsConfig(tsconfig)
        .setArtifactName('declaration')
        .setDistGlobPatterns([`dist/**/*.d.ts`])
        .setShouldCopyNonSupportedFiles(false);
      return config;
    };
    const tsCompiler = react.env.getCompiler([transformer]);

    const compilerTasksOverride = react.overrideCompilerTasks([
      compiler.createTask('BabelCompiler', babelCompiler),
      compiler.createTask('TypescriptCompiler', tsCompiler),
    ]);

    const pkgJsonOverride = react.overridePackageJsonProps({
      files: [
        babelCompiler.distDir,
        `!${babelCompiler.distDir}/tsconfig.tsbuildinfo`,
        '**/*.md',
        '**/*.mdx',
        '**/*.js',
        '**/*.json',
        '**/*.sass',
        '**/*.scss',
        '**/*.less',
        '**/*.css',
        '**/*.css',
        '**/*.jpeg',
        '**/*.gif',
      ],
    });

    const aspectEnv = react.compose(
      [compilerOverride, compilerTasksOverride, pkgJsonOverride],
      new AspectEnv(react.reactEnv)
    );

    const coreExporterTask = new CoreExporterTask(aspectEnv, aspectLoader);
    if (!__dirname.includes('@teambit/bit')) {
      builder.registerBuildTasks([coreExporterTask]);
    }

    envs.registerEnv(aspectEnv);
    generator.registerComponentTemplate([aspectTemplate]);
    return new AspectMain(aspectEnv as AspectEnv, envs);
  }
}

AspectAspect.addRuntime(AspectMain);
