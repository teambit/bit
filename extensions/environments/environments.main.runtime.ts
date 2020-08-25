import { MainRuntime } from '@teambit/cli';
import { Component, ComponentAspect } from '@teambit/component';
import { GraphqlAspect, GraphqlMain } from '@teambit/graphql';
import { Harmony, Slot, SlotRegistry } from '@teambit/harmony';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { ExtensionDataList } from 'bit-bin/dist/consumer/config/extension-data';
import { Environment } from './environment';
import { EnvsAspect } from './environments.aspect';
import { environmentsSchema } from './environments.graphql';
import { EnvRuntime, Runtime } from './runtime';

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

export class EnvsMain {
  static runtime = MainRuntime;

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
    private envSlot: EnvsRegistry,

    private logger: Logger
  ) {}

  /**
   * creates a new runtime environments for a set of components.
   */
  async createEnvironment(components: Component[]): Promise<Runtime> {
    return this.createRuntime(components);
  }

  getEnvFromExtensions(extensions: ExtensionDataList): EnvDefinition {
    const envInExtensionList = extensions.find((e) => this.envSlot.get(e.stringId));
    if (envInExtensionList) {
      return {
        id: envInExtensionList.stringId,
        env: this.envSlot.get(envInExtensionList.stringId) as Environment,
      };
    }
    const defaultEnvId = 'teambit.bit/node';
    const defaultEnv = this.envSlot.get(defaultEnvId);
    if (!defaultEnv) throw new Error(`the default environment "${defaultEnvId}" was not registered`);
    return { id: defaultEnvId, env: defaultEnv };
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
    return new Runtime(this.aggregateByDefs(components), this.logger);
  }

  // :TODO can be refactored to few utilities who will make repeating this very easy.
  private aggregateByDefs(components: Component[]): EnvRuntime[] {
    const envsMap = {};
    components.forEach((component: Component) => {
      const envDef = this.getEnvFromExtensions(component.config.extensions);
      const envId = envDef.id;
      const env = envDef.env;
      // handle config as well when aggregating envs.
      if (envsMap[envId]) envsMap[envId].components.push(component);
      else
        envsMap[envId] = {
          components: [component],
          env,
        };
    });

    return Object.keys(envsMap).map((key) => {
      return new EnvRuntime(key, envsMap[key].env, envsMap[key].components);
    });
  }

  static slots = [Slot.withType<Environment>()];

  static defaultConfig = {};
  static dependencies = [GraphqlAspect, LoggerAspect, ComponentAspect];

  static async provider(
    [graphql, loggerAspect]: [GraphqlMain, LoggerMain],
    config: EnvsConfig,
    [envSlot]: [EnvsRegistry],
    context: Harmony
  ) {
    const logger = loggerAspect.createLogger(EnvsAspect.id);
    const envs = new EnvsMain(config, context, envSlot, logger);
    graphql.register(environmentsSchema(envs));
    return envs;
  }
}

EnvsAspect.addRuntime(EnvsMain);
