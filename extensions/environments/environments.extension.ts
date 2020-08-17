import { Slot, SlotRegistry, Harmony } from '@teambit/harmony';
import { Component, ComponentExtension } from '@teambit/component';
import { Environment } from './environment';
import { EnvRuntime, Runtime } from './runtime';
import { ExtensionDataList } from 'bit-bin/dist/consumer/config/extension-data';
import { environmentsSchema } from './environments.graphql';
import { GraphQLExtension } from '@teambit/graphql';

export type EnvsRegistry = SlotRegistry<Environment>;

export type EnvsConfig = {
  env: string;
  options: EnvOptions;
};

export type EnvOptions = {};

export type EnvDefinition = {
  id: string;
  env: Environment;
};

export type Descriptor = {
  id: string;
  icon: string;
};

export class Environments {
  static id = '@teambit/envs';

  /**
   * icon of the extension.
   */
  icon() {
    return `<svg width="50" height="50" xmlns="http://www.w3.org/2000/svg">
      <circle cx="25" cy="25" r="20"/>
    </svg>`;
  }

  constructor(
    /**
     * environments extension configuration.
     */
    readonly config: EnvsConfig,

    /**
     * harmony context.
     */
    private context: Harmony,

    /**
     * slot for allowing extensions to register new environment.
     */
    private envSlot: EnvsRegistry
  ) {}

  /**
   * creates a new runtime environments for a set of components.
   */
  async createEnvironment(components: Component[]): Promise<Runtime> {
    return this.createRuntime(components);
  }

  // @todo remove duplications from `aggregateByDefs`, it was copied and pasted
  getEnvFromExtensions(extensions: ExtensionDataList): EnvDefinition | null {
    let id;
    let env;
    extensions.forEach((ext) => {
      if (env) {
        return;
      }
      id = ext.stringId;
      env = this.envSlot.get(id);
    });

    if (!env) {
      return null;
    }

    return {
      id,
      env,
    };
  }

  /**
   * get an environment Descriptor.
   */
  getDescriptor(component: Component): Descriptor | null {
    const defaultIcon = `https://static.bit.dev/extensions-icons/default.svg`;
    // TODO: @guy after fix core extension then take it from core extension
    const envDef = this.getEnvFromExtensions(component.config.extensions);
    if (!envDef) return null;
    const instance = this.context.get<any>(envDef.id);
    const iconFn = instance.icon;

    const icon = iconFn ? iconFn() : defaultIcon;
    return {
      id: envDef.id,
      icon,
    };
  }

  /**
   * register an environment.
   */
  registerEnv(env: Environment) {
    // @ts-ignore
    return this.envSlot.register(env);
  }

  /**
   * compose two environments into one.
   */
  compose(targetEnv: Environment, sourceEnv: Environment): Environment {
    const allNames = new Set<string>();
    for (let o = sourceEnv; o !== Object.prototype; o = Object.getPrototypeOf(o)) {
      for (const name of Object.getOwnPropertyNames(o)) {
        allNames.add(name);
      }
    }

    allNames.forEach((key: string) => {
      const fn = sourceEnv[key];
      if (!fn || !fn.bind || targetEnv[key]) return;
      targetEnv[key] = fn.bind(sourceEnv);
    });

    return targetEnv;
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
      const envDef = this.getEnvFromExtensions(current.config.extensions);
      if (!envDef) return;
      const envId = envDef.id;
      const env = envDef.env;
      if (!env) throw new Error(`an environment was not registered in extension ${envId}`);

      // handle config as well when aggregating envs.
      if (map[envId]) map[envId].components.push(current);
      else
        map[envId] = {
          components: [current],
          env,
        };
    }, {});

    return Object.keys(map).map((key) => {
      return new EnvRuntime(key, map[key].env, map[key].components);
    });
  }

  static slots = [Slot.withType<Environment>()];

  static defaultConfig = {};
  static dependencies = [GraphQLExtension, ComponentExtension];

  static async provider(
    [graphql]: [GraphQLExtension],
    config: EnvsConfig,
    [envSlot]: [EnvsRegistry],
    context: Harmony
  ) {
    const envs = new Environments(config, context, envSlot);
    graphql.register(environmentsSchema(envs));
    return envs;
  }
}
