import { AspectLoaderAspect, AspectLoaderMain } from '@teambit/aspect-loader';
import { BuilderAspect, BuilderMain } from '@teambit/builder';
import { MainRuntime } from '@teambit/cli';
import { EnvsAspect, EnvsMain, EnvTransformer } from '@teambit/envs';
import { ReactAspect, ReactMain } from '@teambit/react';
import { GeneratorAspect, GeneratorMain } from '@teambit/generator';
import { BabelAspect, BabelMain } from '@teambit/babel';
import { CompilerAspect, CompilerMain } from '@teambit/compiler';
import { PreviewAspect, PreviewMain } from '@teambit/preview';
import { AspectAspect } from './aspect.aspect';
import { AspectEnv } from './aspect.env';
import { CoreExporterTask } from './core-exporter.task';
import { aspectTemplate } from './templates/aspect';

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
    PreviewAspect,
    AspectLoaderAspect,
    CompilerAspect,
    BabelAspect,
    GeneratorAspect,
  ];

  static async provider([react, envs, builder, preview, aspectLoader, compiler, babel, generator]: [
    ReactMain,
    EnvsMain,
    BuilderMain,
    PreviewMain,
    AspectLoaderMain,
    CompilerMain,
    BabelMain,
    GeneratorMain
  ]) {
    const aspectEnv = envs.merge<AspectEnv>(
      new AspectEnv(react.reactEnv, babel, compiler, envs, preview),
      react.reactEnv
    );
    const coreExporterTask = new CoreExporterTask(aspectEnv, aspectLoader);
    if (!__dirname.includes('@teambit/bit')) {
      builder.registerBuildTasks([coreExporterTask]);
    }

    envs.registerEnv(aspectEnv);
    generator.registerComponentTemplate([aspectTemplate]);
    return new AspectMain(aspectEnv, envs);
  }
}

AspectAspect.addRuntime(AspectMain);
