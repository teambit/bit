import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { Component, ComponentAspect, ComponentMain } from '@teambit/component';
import { GraphqlAspect, GraphqlMain } from '@teambit/graphql';
import { Harmony, Slot, SlotRegistry } from '@teambit/harmony';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { ExtensionDataList } from 'bit-bin/dist/consumer/config/extension-data';
import findDuplications from 'bit-bin/dist/utils/array/find-duplications';
import { EnvService } from './services';
import { Environment } from './environment';
import { EnvsAspect } from './environments.aspect';
import { environmentsSchema } from './environments.graphql';
import { EnvRuntime, Runtime } from './runtime';
import { EnvDefinition } from './env-definition';
import { EnvServiceList } from './env-service-list';
import { EnvsCmd } from './envs.cmd';
import { EnvFragment } from './env.fragment';

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
  services?: [];
};

export const DEFAULT_ENV = 'teambit.harmony/node';

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
    // Search first for env configured via envs aspect itself
    const envsAspect = component.state.aspects.get(EnvsAspect.id);
    const envId = envsAspect?.config.env;
    let env;
    if (envId) {
      env = this.envSlot.get(envId);
    }
    if (env) {
      return new EnvDefinition(envId, env as Environment);
    }

    let id = '';
    const envEntry = component.state.aspects.entries.find((aspectEntry) => {
      id = aspectEntry.id.toString();
      env = this.envSlot.get(id);
      if (!env) {
        // during the tag process, the version in the aspect-entry-id is changed and is not the
        // same as it was when it registered to the slot.
        id = aspectEntry.id.toString({ ignoreVersion: true });
        env = this.envSlot.get(id);
      }
      return !!env;
    });

    if (!envEntry) return this.getDefaultEnv();
    return new EnvDefinition(id, env as Environment);
  }

  /**
   * @deprecated DO NOT USE THIS METHOD ANYMORE!!! (PLEASE USE .getEnv() instead!)
   */
  getEnvFromExtensions(extensions: ExtensionDataList): EnvDefinition {
    // Search first for env configured via envs aspect itself
    const envsAspect = extensions.findCoreExtension(EnvsAspect.id);
    const envId = envsAspect?.config.env;
    let env;
    if (envId) {
      env = this.envSlot.get(envId);
    }
    if (env) {
      return new EnvDefinition(envId, env as Environment);
    }

    const envInExtensionList = extensions.find((e) =>
      this.envSlot.get(e.newExtensionId ? e.newExtensionId.toString() : e.stringId)
    );
    if (envInExtensionList) {
      const id = envInExtensionList.newExtensionId
        ? envInExtensionList.newExtensionId.toString()
        : envInExtensionList.stringId;
      return new EnvDefinition(id, this.envSlot.get(id) as Environment);
    }
    const defaultEnvId = 'teambit.harmony/node';
    const defaultEnv = this.envSlot.get(defaultEnvId);
    if (!defaultEnv) throw new Error(`the default environment "${defaultEnvId}" was not registered`);
    return new EnvDefinition(defaultEnvId, defaultEnv);
  }

  /**
   * determines whether an env is registered.
   */
  isEnvRegistered(id: string) {
    return Boolean(this.envSlot.get(id));
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
    return !!service.getDescriptor(env);
  }

  /**
   * get an environment Descriptor.
   */
  getDescriptor(component: Component): Descriptor | null {
    let envsData = component.state.aspects.get(EnvsAspect.id);
    if (!envsData) {
      // TODO: remove this once we re-export old components used to store the data here
      envsData = component.state.aspects.get('teambit.workspace/workspace');
    }
    if (!envsData) throw new Error(`env was not configured on component ${component.id.toString()}`);

    return {
      id: envsData.data.id,
      icon: envsData.data.icon,
      services: envsData.data.services,
    };
  }

  /**
   * register an environment.
   */
  registerEnv(env: Environment) {
    return this.envSlot.register(env);
  }

  /**
   * compose two environments into one.
   */
  merge<T>(targetEnv: Environment, sourceEnv: Environment): T {
    const allNames = new Set<string>();
    const keys = ['icon', 'name', 'description'];
    for (let o = sourceEnv; o !== Object.prototype; o = Object.getPrototypeOf(o)) {
      for (const name of Object.getOwnPropertyNames(o)) {
        allNames.add(name);
      }
    }

    allNames.forEach((key: string) => {
      const fn = sourceEnv[key];
      if (targetEnv[key]) return;
      if (keys.includes(key)) targetEnv[key] = fn;
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
    this.throwForDuplicateComponents(components);
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

  private throwForDuplicateComponents(components: Component[]) {
    const idsStr = components.map((c) => c.id.toString());
    const duplications = findDuplications(idsStr);
    if (duplications.length) {
      throw new Error(`found duplicated components: ${duplications.join(', ')}`);
    }
  }

  static slots = [Slot.withType<Environment>(), Slot.withType<EnvService<any>>()];

  static dependencies = [GraphqlAspect, LoggerAspect, ComponentAspect, CLIAspect];

  static async provider(
    [graphql, loggerAspect, component, cli]: [GraphqlMain, LoggerMain, ComponentMain, CLIMain],
    config: EnvsConfig,
    [envSlot, serviceSlot]: [EnvsRegistry, ServiceSlot],
    context: Harmony
  ) {
    const logger = loggerAspect.createLogger(EnvsAspect.id);
    const envs = new EnvsMain(config, context, envSlot, logger, serviceSlot, component);
    component.registerShowFragments([new EnvFragment(envs)]);
    cli.register(new EnvsCmd(envs, component));
    graphql.register(environmentsSchema(envs));
    return envs;
  }
}

EnvsAspect.addRuntime(EnvsMain);
