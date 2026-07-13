import type { Harmony } from '@teambit/harmony';
import type { EnvPolicyConfigObject } from '@teambit/dependency-resolver';
import { merge } from 'lodash';
import type { LoggerMain } from '@teambit/logger';
import { LoggerAspect } from '@teambit/logger';
import { MainRuntime } from '@teambit/cli';
import type { GeneratorMain } from '@teambit/generator';
import { GeneratorAspect } from '@teambit/generator';
import { ComponentID } from '@teambit/component-id';
import type { WorkerMain } from '@teambit/worker';
import { WorkerAspect } from '@teambit/worker';
import type { ApplicationMain } from '@teambit/application';
import { ApplicationAspect } from '@teambit/application';
import type { EnvsMain, Environment, EnvTransformer } from '@teambit/envs';
import { EnvsAspect, EnvContext } from '@teambit/envs';
import esmLoader from '@teambit/node.utils.esm-loader';
import { NodeAspect } from './node.aspect';
import type { VitestModule } from './node.env';
import { NodeEnv } from './node.env';
import { getTemplates } from './node.templates';
import { getStarters } from './node.starters';
import { NodeAppType } from './node.app-type';

export class NodeMain {
  constructor(
    readonly nodeEnv: NodeEnv,
    private envs: EnvsMain
  ) {}

  icon() {
    return 'https://static.bit.dev/extensions-icons/nodejs.svg';
  }

  /**
   * override the dependency configuration of the component environment.
   */
  overrideDependencies(dependencyPolicy: EnvPolicyConfigObject) {
    return this.envs.override({
      getDependencies: () => merge(this.nodeEnv.getDependencies(), dependencyPolicy),
    });
  }

  /**
   * create a new composition of the node environment.
   */
  compose(transformers: EnvTransformer[], targetEnv: Environment = {}) {
    return this.envs.compose(this.envs.merge(targetEnv, this.nodeEnv), transformers);
  }

  static runtime = MainRuntime;

  static dependencies = [LoggerAspect, EnvsAspect, ApplicationAspect, GeneratorAspect, WorkerAspect];

  static async provider(
    [loggerAspect, envs, application, generator, workerMain]: [
      LoggerMain,
      EnvsMain,
      ApplicationMain,
      GeneratorMain,
      WorkerMain,
    ],
    _config,
    _slots,
    harmony: Harmony
  ) {
    const logger = loggerAspect.createLogger(NodeAspect.id);
    const envContext = new EnvContext(ComponentID.fromString(NodeAspect.id), loggerAspect, workerMain, harmony);

    // `@teambit/vite.vitest-tester` is ESM-only; pre-load it here (in the async provider) via the
    // esm loader so the CJS core aspect can hand the tester/task classes to the env synchronously.
    const vitest = (await esmLoader(require.resolve('@teambit/vite.vitest-tester'), true)) as VitestModule;

    const nodeEnv = new NodeEnv(envContext, vitest);
    envs.registerEnv(nodeEnv);

    const nodeAppType = new NodeAppType('node-app', nodeEnv, logger);
    application.registerAppType(nodeAppType);

    if (generator) {
      generator.registerComponentTemplate(() => getTemplates(envContext));
      generator.registerWorkspaceTemplate(() => getStarters(envContext));
    }

    return new NodeMain(nodeEnv, envs);
  }
}

NodeAspect.addRuntime(NodeMain);
