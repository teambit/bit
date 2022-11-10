import { PluginDefinition } from '@teambit/aspect-loader';
import { Aspect, Harmony } from '@teambit/harmony';
import { ComponentID } from '@teambit/component';
import { WorkerMain } from '@teambit/worker';
import { MainRuntime } from '@teambit/cli';
import { LoggerMain } from '@teambit/logger';
import { ServiceHandlerContext as EnvContext } from './services/service-handler-context';
import { Env } from './env-interface';
import { EnvsRegistry } from './environments.main.runtime';

export class EnvPlugin implements PluginDefinition {
  constructor(
    private envSlot: EnvsRegistry,
    private loggerMain: LoggerMain,
    private workerMain: WorkerMain,
    private harmony: Harmony
  ) {}

  pattern = '*.bit-env.*';

  runtimes = [MainRuntime.name];

  private createContext(envId: ComponentID) {
    return new EnvContext(envId, this.loggerMain, this.workerMain, this.harmony);
  }

  private transformToLegacyEnv(envId: string, env: Env) {
    // HACK BECAUSE OF OLD APIS WE SHOULD MIGRATE EACH TO BE HANDLED BY ITS SERVICE
    // E.G. COMPILER SHOULD BE TRANSFORMED IN COMPILER NOT HERE!
    // const 
    const envComponentId = ComponentID.fromString(envId);
    const envContext = this.createContext(envComponentId);
    const preview = env.preview()(envContext);

    return {
      getCompiler: () => env.compiler()(envContext),
      getTester: () => env.tester()(envContext),
      // getDevEnvId: ()
      name: env.name,
      icon: env.icon,
      getDevEnvId: () => {
        return 'teambit.react/react';
      },
      getDevServer: (context) => {
        return preview.getDevServer(context)(envContext);
      },
      getAdditionalHostDependencies: preview.getAdditionalHostDependencies,
      getProvider: preview.getProvider,
      getMounter: preview.getMounter,
      getDocsTemplate: preview.getDocsTemplate,
      getPreviewConfig: preview.getPreviewConfig,
      getBundler: (context) => preview.getBundler(context),
      __getDescriptor: async () => {
        return {
          type: env.name,
        }
      },
      id: envId,
      // ...preview.toLegacyEnv(),
    }
  }

  register(object: any, aspect: Aspect) {
    const env = this.transformToLegacyEnv(aspect.id, object);
    return this.envSlot.register(env);
  }
}
