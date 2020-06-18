import { Slot, SlotRegistry } from '@teambit/harmony';
import { Component } from '../component';
import { Environment } from './environment';
import { EnvRuntime, Runtime } from './runtime';
import { ExtensionDataList } from '../../consumer/config/extension-data';

export type EnvsRegistry = SlotRegistry<Environment>;

export type EnvsConfig = {
  env: string;
  options: EnvOptions;
};

export type EnvOptions = {};

export class Environments {
  static id = '@teambit/envs';
  static dependencies = [];

  constructor(
    /**
     * environments extension configuration.
     */
    readonly config: EnvsConfig,

    /**
     * slot for allowing extensions to register new environment.
     */
    private envSlot: EnvsRegistry
  ) {}

  /**
   * create a development runtime environment.
   */
  async dev(components: Component[]): Promise<Runtime> {
    // :TODO how to standardize this? we need to make sure all validation errors will throw nicely at least.
    return this.createRuntime(components);
  }

  async createEnvironment(components: Component[]): Promise<Runtime> {
    return this.createRuntime(components);
  }

  // @todo remove duplications from `aggregateByDefs`, it was copied and pasted
  getEnvFromExtensions(extensions: ExtensionDataList): Environment | null {
    const extension = extensions.findExtension(Environments.id);
    if (!extension) return null;
    const envId = extension.config.env;
    // here wen can do some better error handling from the harmony API with abit wrapper (next two lines)
    const env = this.envSlot.get(envId);
    if (!env) throw new Error(`an environment was not registered in extension ${envId}`);
    return env;
  }

  /**
   * register an environment.
   */
  registerEnv(env: Environment) {
    // @ts-ignore
    return this.envSlot.register(env);
  }

  // refactor here
  private createRuntime(components: Component[]): Runtime {
    return new Runtime(this.aggregateByDefs(components));
  }

  // :TODO can be refactorerd to few utilities who will make repeating this very easy.
  private aggregateByDefs(components: Component[]): EnvRuntime[] {
    const map = {};
    components.forEach((current: Component) => {
      // :TODO fix this api. replace with `this.id` and improve naming.
      // const extension = current.config.extensions.findExtension(this.id);
      const extension = current.config.extensions.findExtension(Environments.id);
      // this can also be handled better
      if (!extension) return;
      const envId = extension.config.env;
      // here wen can do some better error handling from the harmony API with abit wrapper (next two lines)
      const env = this.envSlot.get(envId);
      if (!env) throw new Error(`an environment was not registered in extension ${envId}`);

      // handle config as well when aggregating envs.
      if (map[envId]) map[envId].components.push(current);
      else
        map[envId] = {
          components: [current],
          env
        };
    }, {});

    return Object.keys(map).map(key => {
      return new EnvRuntime(key, map[key].env, map[key].components);
    });
  }

  static slots = [Slot.withType<Environment>()];

  static defaultConfig = {};

  static async provider(_deps: [], config: EnvsConfig, [envSlot]: [EnvsRegistry]) {
    const envs = new Environments(config, envSlot);
    return envs;
  }
}
