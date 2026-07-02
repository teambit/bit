import type { Harmony } from '@teambit/harmony';
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
import { EnvContext, EnvsAspect } from '@teambit/envs';
import type { TypescriptMain } from '@teambit/typescript';
import { TypescriptAspect } from '@teambit/typescript';
import type { GeneratorMain } from '@teambit/generator';
import { GeneratorAspect } from '@teambit/generator';
import { ComponentID } from '@teambit/component-id';
import type { WorkerMain } from '@teambit/worker';
import { WorkerAspect } from '@teambit/worker';
import type { CompilerMain } from '@teambit/compiler';
import { CompilerAspect } from '@teambit/compiler';
import { AspectAspect } from './aspect.aspect';
import { AspectEnv } from './aspect.env';
import { CoreExporterTask } from './core-exporter.task';
import { babelConfig } from './babel/babel-config';
import { getTemplates } from './aspect.templates';
import { getStarters } from './aspect.starters';
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
        const aspectDeps = await this.aspectEnv.getDependencies();
        return merge(aspectDeps, dependencyPolicy);
      },
    });
  }

  static runtime = MainRuntime;
  static dependencies = [
    TypescriptAspect,
    EnvsAspect,
    BuilderAspect,
    AspectLoaderAspect,
    CompilerAspect,
    GeneratorAspect,
    LoggerAspect,
    WorkerAspect,
    DevFilesAspect,
  ];

  static async provider(
    [tsAspect, envs, builder, aspectLoader, compiler, generator, loggerMain, workerMain, devFilesMain]: [
      TypescriptMain,
      EnvsMain,
      BuilderMain,
      AspectLoaderMain,
      CompilerMain,
      GeneratorMain,
      LoggerMain,
      WorkerMain,
      DevFilesMain,
    ],
    config,
    slots,
    harmony: Harmony
  ) {
    const logger = loggerMain.createLogger(AspectAspect.id);

    const aspectEnv = new AspectEnv(tsAspect, aspectLoader, devFilesMain, compiler, workerMain, logger);

    const coreExporterTask = new CoreExporterTask(aspectEnv, aspectLoader);
    if (!__dirname.includes('@teambit/bit')) {
      builder.registerBuildTasks([coreExporterTask]);
    }

    envs.registerEnv(aspectEnv);
    if (generator) {
      const envContext = new EnvContext(ComponentID.fromString(AspectAspect.id), loggerMain, workerMain, harmony);
      generator.registerComponentTemplate(() => getTemplates(envContext));
      generator.registerWorkspaceTemplate(() => getStarters(envContext));
    }
    const aspectMain = new AspectMain(aspectEnv, envs);

    return aspectMain;
  }
}

AspectAspect.addRuntime(AspectMain);
