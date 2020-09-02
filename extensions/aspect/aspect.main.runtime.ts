import {AspectLoaderAspect, AspectLoaderMain} from '@teambit/aspect-loader';
import { BuilderAspect, BuilderMain } from '@teambit/builder';
import { MainRuntime } from '@teambit/cli';
import { EnvsAspect, EnvsMain } from '@teambit/environments';
import { ReactAspect, ReactMain } from '@teambit/react';

import { AspectAspect } from './aspect.aspect';
import { AspectEnv } from './aspect.env';
import {CoreExporterTask} from './core-exporter.task';

export class AspectMain {
  static runtime = MainRuntime;
  static dependencies = [ReactAspect, EnvsAspect, BuilderAspect, AspectLoaderAspect];

  static async provider([react, envs, builder, aspectLoader]: [ReactMain, EnvsMain, BuilderMain, AspectLoaderMain]) {
    const env = envs.compose(new AspectEnv(react.reactEnv), react.reactEnv);
    const coreExporterTask = new CoreExporterTask(env, aspectLoader);
    builder.registerTask(coreExporterTask);
    envs.registerEnv(env);
    return new AspectMain();
  }
}

AspectAspect.addRuntime(AspectMain);
