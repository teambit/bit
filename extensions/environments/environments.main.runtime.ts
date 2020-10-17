import { MainRuntime } from '@teambit/cli';
import { Component, ComponentAspect, ComponentMain } from '@teambit/component';
import { EnvService } from './services';
import { GraphqlAspect, GraphqlMain } from '@teambit/graphql';
import { Harmony, Slot, SlotRegistry } from '@teambit/harmony';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { ExtensionDataList } from 'bit-bin/dist/consumer/config/extension-data';
import { Environment } from './environment';
import { EnvsAspect } from './environments.aspect';
import { environmentsSchema } from './environments.graphql';
import { EnvRuntime, Runtime } from './runtime';
import { EnvDefinition } from './env-definition';
import { EnvServiceList } from './env-service-list';

export type EnvsRegistry = SlotRegistry<Environment>;

export type EnvsConfig = {
  env: string;
  options: EnvOptions;
};

export type EnvOptions = {};

export type EnvTransformer = (env: Environment) => Environment;

export type ServiceSlot = SlotRegistry<EnvService<any>>;

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

    private logger: Logger,

    private serviceSlot: ServiceSlot,

    private componentMain: ComponentMain
  ) {}

  /**
   * creates a new runtime environments for a set of components.
   */
  async createEnvironment(components: Component[]): Promise<Runtime> {
    return this.createRuntime(components);
  }

  /**
   * get the configured default env.
   */
  getDefaultEnv(): EnvDefinition {
    const defaultEnv = this.envSlot.get(DEFAULT_ENV);
    if (!defaultEnv) throw new Error('default env must be set.');

    return new EnvDefinition(DEFAULT_ENV, defaultEnv);
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
   * create an env transformer which overrides specific env properties.
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
    return new EnvDefinition(id, this.envSlot.get(id) as Environment);
  }

  /**
   * register a new environment service.
   */
  registerService(envService: EnvService<any>) {
    this.serviceSlot.register(envService);
    return this;
  }

  /**
   * get list of services enabled on an env.
   */
  getServices(env: EnvDefinition): EnvServiceList {
    const allServices = this.serviceSlot.toArray();
    const services = allServices.filter(([, service]) => {
      return this.implements(env, service);
    });

    return new EnvServiceList(env, services);
  }

  implements(env: EnvDefinition, service: EnvService<any>) {
    // TODO: remove this after refactoring everything and remove getDescriptor from being optional.
    if (!service.getDescriptor) return false;
    return !!service.getDescriptor(env.env);
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
      return new EnvDefinition(id, this.envSlot.get(id) as Environment);
    }
    const defaultEnvId = 'teambit.bit/node';
    const defaultEnv = this.envSlot.get(defaultEnvId);
    if (!defaultEnv) throw new Error(`the default environment "${defaultEnvId}" was not registered`);
    return new EnvDefinition(defaultEnvId, defaultEnv);
  }

  /**
   * get an environment Descriptor.
   */
  getDescriptor(component: Component): Descriptor | null {
    const envDef = this.getEnv(component);
    if (!envDef) return null;
    return envDef;
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

  static slots = [Slot.withType<Environment>(), Slot.withType<EnvService<any>>()];

  static dependencies = [GraphqlAspect, LoggerAspect, ComponentAspect];

  static async provider(
    [graphql, loggerAspect, component]: [GraphqlMain, LoggerMain, ComponentMain],
    config: EnvsConfig,
    [envSlot, serviceSlot]: [EnvsRegistry, ServiceSlot],
    context: Harmony
  ) {
    const logger = loggerAspect.createLogger(EnvsAspect.id);
    const envs = new EnvsMain(config, context, envSlot, logger, serviceSlot, component);
    graphql.register(environmentsSchema(envs));
    return envs;
  }
}

EnvsAspect.addRuntime(EnvsMain);
