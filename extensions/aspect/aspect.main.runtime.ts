import { AspectLoaderAspect, AspectLoaderMain } from '@teambit/aspect-loader';
import { BuilderAspect, BuilderMain } from '@teambit/builder';
import { MainRuntime } from '@teambit/cli';
import { EnvsAspect, EnvsMain, EnvTransformer } from '@teambit/environments';
import { ReactAspect, ReactMain } from '@teambit/react';
import { AspectAspect } from './aspect.aspect';
import { AspectEnv } from './aspect.env';
import { CoreExporterTask } from './core-exporter.task';

export class AspectMain {
  constructor(readonly aspectEnv: AspectEnv, private envs: EnvsMain) {}

  /**
   * compose your own aspect environment.
   */
  compose(transformers: EnvTransformer[] = []) {
    return this.envs.compose(this.aspectEnv, transformers);
  }

  static runtime = MainRuntime;
  static dependencies = [ReactAspect, EnvsAspect, BuilderAspect, AspectLoaderAspect];

  static async provider([react, envs, builder, aspectLoader]: [ReactMain, EnvsMain, BuilderMain, AspectLoaderMain]) {
    const aspectEnv = envs.merge<AspectEnv>(new AspectEnv(react.reactEnv), react.reactEnv);
    const coreExporterTask = new CoreExporterTask(aspectEnv, aspectLoader);
    if (!__dirname.includes('@teambit/bit')) {
      builder.registerTask(coreExporterTask);
    }

    envs.registerEnv(aspectEnv);
    return new AspectMain(aspectEnv, envs);
  }
}

AspectAspect.addRuntime(AspectMain);
