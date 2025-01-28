import { PluginDefinition } from '@teambit/aspect-loader';
import { Harmony } from '@teambit/harmony';
import { ComponentID } from '@teambit/component';
import { WorkerMain } from '@teambit/worker';
import { MainRuntime } from '@teambit/cli';
import { LoggerMain } from '@teambit/logger';
import { flatten } from 'lodash';
import { ServiceHandlerContext as EnvContext } from './services/service-handler-context';
import { Env } from './env-interface';
import { EnvsRegistry, ServicesRegistry } from './environments.main.runtime';

export class EnvPlugin implements PluginDefinition {
  constructor(
    private envSlot: EnvsRegistry,
    private servicesRegistry: ServicesRegistry,
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
    const envComponentId = ComponentID.fromString(envId);
    const envContext = this.createContext(envComponentId);
    const allServices = flatten(this.servicesRegistry.values());
    const transformers = allServices.reduce((acc, service) => {
      if (!service.transform) return acc;
      const currTransformer = service.transform(env, envContext);
      if (!currTransformer) return acc;
      return { ...acc, ...currTransformer };
    }, {});

    return {
      ...transformers,
      name: env.name,
      icon: env.icon,
      __path: env.__path,
      __resolvedPath: env.__resolvedPath,
      __getDescriptor: async () => {
        return {
          type: env.type || env.name,
        };
      },
      id: envId,
    };
  }

  register(object: any, aspect: { id: string }) {
    const env = this.transformToLegacyEnv(aspect.id, object);
    // This is required when we call it manually and the aspect id fn return the wrong
    // id
    // We call the set directly because when we call it manually during install
    // the aspect id fn return the wrong id
    // Please do not change this without consulting @GiladShoham
    // This manual call from install is required to make sure we re-load the envs
    // when they move to another location in the node_modules
    // during process is still running (like during bit new, bit switch, bit server)
    this.envSlot.map.set(aspect.id, env);
    return;
  }
}
