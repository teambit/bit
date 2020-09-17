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

export type EnvTransformer = (env: Environment) => Environment;

export type EnvDefinition = {
  id: string;
  env: Environment;
};

export type Descriptor = {
  id: string;
  icon: string;
};

export const DEFAULT_ENV = 'teambit.bit/node';

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

  getDefaultEnv(): EnvDefinition {
    const defaultEnv = this.envSlot.get(DEFAULT_ENV);
    if (!defaultEnv) throw new Error('default env must be set.');

    return {
      id: DEFAULT_ENV,
      env: defaultEnv,
    };
  }

  /**
   * compose a new environment from a list of environment transformers.
   */
  compose(targetEnv: Environment, envTransformers: EnvTransformer[]) {
    const a = envTransformers.reduce((acc, transformer) => {
      acc = transformer(acc);
      return acc;
    }, targetEnv);

    return a;
  }

  /**
   * override members of an environment and return an env transformer.
   */
  override(propsToOverride: Environment): EnvTransformer {
    return (env: Environment) => {
      return this.merge(propsToOverride, env);
    };
  }

  /**
   * get the env of the given component.
   */
  getEnv(component: Component): EnvDefinition {
    const env = component.state.aspects.entries.find((aspectEntry) => {
      const id = aspectEntry.id.toString();
      return this.envSlot.get(id);
    });

    if (!env) return this.getDefaultEnv();
    const id = env.id.toString();
    return {
      id,
      env: this.envSlot.get(id) as Environment,
    };
  }

  /**
   * @deprecated DO NOT USE THIS METHOD ANYMORE!!! (PLEASE USE .getEnv() instead!)
   */
  getEnvFromExtensions(extensions: ExtensionDataList): EnvDefinition {
    const envInExtensionList = extensions.find((e) =>
      this.envSlot.get(e.newExtensionId ? e.newExtensionId.toString() : e.stringId)
    );
    if (envInExtensionList) {
      const id = envInExtensionList.newExtensionId
        ? envInExtensionList.newExtensionId.toString()
        : envInExtensionList.stringId;
      return {
        id,
        env: this.envSlot.get(id) as Environment,
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
    const envDef = this.getEnv(component);
    if (!envDef) return null;
    const instance = this.context.get<any>(envDef.id);
    const iconFn = instance.icon;

    const icon = iconFn ? iconFn.apply(instance) : defaultIcon;
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
  merge<T>(targetEnv: Environment, sourceEnv: Environment): T {
    const allNames = new Set<string>();
    for (let o = sourceEnv; o !== Object.prototype; o = Object.getPrototypeOf(o)) {
      for (const name of Object.getOwnPropertyNames(o)) {
        allNames.add(name);
      }
    }

    allNames.forEach((key: string) => {
      const fn = sourceEnv[key];
      if (targetEnv[key]) return;
      if (!fn || !fn.bind) {
        return;
      }
      targetEnv[key] = fn.bind(sourceEnv);
    });

    return targetEnv as T;
  }

  // refactor here
  private createRuntime(components: Component[]): Runtime {
    return new Runtime(this.aggregateByDefs(components), this.logger);
  }

  // :TODO can be refactored to few utilities who will make repeating this very easy.
  private aggregateByDefs(components: Component[]): EnvRuntime[] {
    const envsMap = {};
    components.forEach((component: Component) => {
      const envDef = this.getEnv(component);
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
