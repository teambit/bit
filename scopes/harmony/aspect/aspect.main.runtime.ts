import type { AspectLoaderMain } from '@teambit/aspect-loader';
import { AspectLoaderAspect } from '@teambit/aspect-loader';
import type { LoggerMain } from '@teambit/logger';
import { LoggerAspect } from '@teambit/logger';
import type { BuilderMain } from '@teambit/builder';
import { BuilderAspect } from '@teambit/builder';
import { merge } from 'lodash';
import type { EnvPolicyConfigObject } from '@teambit/dependency-resolver';
import { MainRuntime } from '@teambit/cli';
import type { Environment, EnvsMain, EnvTransformer } from '@teambit/envs';
import { EnvsAspect } from '@teambit/envs';
import type { ReactEnv, ReactMain } from '@teambit/react';
import { ReactAspect } from '@teambit/react';
import type { WorkerMain } from '@teambit/worker';
import { WorkerAspect } from '@teambit/worker';
import type { CompilerMain } from '@teambit/compiler';
import { CompilerAspect } from '@teambit/compiler';
import { AspectAspect } from './aspect.aspect';
import { AspectEnv } from './aspect.env';
import { CoreExporterTask } from './core-exporter.task';
import { babelConfig } from './babel/babel-config';
import type { DevFilesMain } from '@teambit/dev-files';
import { DevFilesAspect } from '@teambit/dev-files';

export class AspectMain {
  constructor(
    readonly aspectEnv: AspectEnv,
    private envs: EnvsMain
  ) {}

  /**
   * compose your own aspect environment.
   */
  compose(transformers: EnvTransformer[] = [], targetEnv: Environment = {}) {
    return this.envs.compose(this.envs.merge(targetEnv, this.aspectEnv), transformers);
  }

  get babelConfig() {
    return babelConfig;
  }

  /**
   * override the dependency configuration of the component environment.
   */
  overrideDependencies(dependencyPolicy: EnvPolicyConfigObject) {
    return this.envs.override({
      getDependencies: async () => {
        const reactDeps = await this.aspectEnv.getDependencies();
        return merge(reactDeps, dependencyPolicy);
      },
    });
  }

  static runtime = MainRuntime;
  static dependencies = [
    ReactAspect,
    EnvsAspect,
    BuilderAspect,
    AspectLoaderAspect,
    CompilerAspect,
    LoggerAspect,
    WorkerAspect,
    DevFilesAspect,
  ];

  static async provider([react, envs, builder, aspectLoader, compiler, loggerMain, workerMain, devFilesMain]: [
    ReactMain,
    EnvsMain,
    BuilderMain,
    AspectLoaderMain,
    CompilerMain,
    LoggerMain,
    WorkerMain,
    DevFilesMain,
  ]) {
    const logger = loggerMain.createLogger(AspectAspect.id);

    const aspectEnv = envs.merge<AspectEnv, ReactEnv>(
      new AspectEnv(react.reactEnv, aspectLoader, devFilesMain, compiler, workerMain, logger),
      react.reactEnv
    );

    const coreExporterTask = new CoreExporterTask(aspectEnv, aspectLoader);
    if (!__dirname.includes('@teambit/bit')) {
      builder.registerBuildTasks([coreExporterTask]);
    }

    envs.registerEnv(aspectEnv);
    // note: the aspect templates and starters were moved to the generator aspect (which stays a
    // core aspect), so "bit create bit-aspect" and "bit new" work without loading this env.
    const aspectMain = new AspectMain(aspectEnv as AspectEnv, envs);

    return aspectMain;
  }
}

AspectAspect.addRuntime(AspectMain);
