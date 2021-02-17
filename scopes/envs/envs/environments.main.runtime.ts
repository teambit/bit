import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { Component, ComponentAspect, ComponentMain, ComponentID, AspectData } from '@teambit/component';
import { GraphqlAspect, GraphqlMain } from '@teambit/graphql';
import { Harmony, Slot, SlotRegistry } from '@teambit/harmony';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { ExtensionDataList, ExtensionDataEntry } from '@teambit/legacy/dist/consumer/config/extension-data';
import findDuplications from '@teambit/legacy/dist/utils/array/find-duplications';
import { EnvService } from './services';
import { Environment } from './environment';
import { EnvsAspect } from './environments.aspect';
import { environmentsSchema } from './environments.graphql';
import { EnvRuntime, Runtime } from './runtime';
import { EnvDefinition } from './env-definition';
import { EnvServiceList } from './env-service-list';
import { EnvsCmd } from './envs.cmd';
import { EnvFragment } from './env.fragment';
import { EnvNotFound } from './exceptions';

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

  private alreadyShownWarning = {};

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

  getEnvData(component: Component): AspectData {
    let envsData = component.state.aspects.get(EnvsAspect.id);
    if (!envsData) {
      // TODO: remove this once we re-export old components used to store the data here
      envsData = component.state.aspects.get('teambit.workspace/workspace');
    }
    if (!envsData) throw new Error(`env was not configured on component ${component.id.toString()}`);
    return envsData.data;
  }

  /**
   * get the env id of the given component.
   */
  getEnvId(component: Component): string {
    const envsData = this.getEnvData(component);
    return envsData.id;
  }

  /**
   * get the env of the given component.
   * In case you are asking for the env during on load you should use calculateEnv instead
   */
  getEnv(component: Component): EnvDefinition {
    const id = this.getEnvId(component);
    const envDef = this.getEnvDefinitionByStringId(id);
    if (envDef) {
      return envDef;
    }
    // Do not allow a non existing env
    throw new EnvNotFound(id, component.id.toString());
  }

  /**
   * get an environment Descriptor.
   */
  getDescriptor(component: Component): Descriptor | null {
    const envsData = this.getEnvData(component);
    return {
      id: envsData.id,
      icon: envsData.icon,
      services: envsData.services,
    };
  }

  /**
   * This used to calculate the actual env during the component load.
   * Do not use it to get the env (use getEnv instead)
   * This should be used only during on load
   */
  calculateEnv(component: Component): EnvDefinition {
    // Search first for env configured via envs aspect itself
    const envsAspect = component.state.aspects.get(EnvsAspect.id);
    const envIdFromEnvsConfig = envsAspect?.config.env;
    if (envIdFromEnvsConfig) {
      const envDef = this.getEnvDefinitionByStringId(envIdFromEnvsConfig);
      if (envDef) {
        return envDef;
      }
    }

    // in some cases we have the id configured in the teambit.envs/envs but without the version
    // in such cases we won't find it in the slot
    // we search in the component aspect list a matching aspect which is match the id from the teambit.envs/envs
    if (envIdFromEnvsConfig) {
      const matchedEntry = component.state.aspects.entries.find((aspectEntry) => {
        return (
          envIdFromEnvsConfig === aspectEntry.id.toString() ||
          envIdFromEnvsConfig === aspectEntry.id.toString({ ignoreVersion: true })
        );
      });
      if (matchedEntry) {
        // during the tag process, the version in the aspect-entry-id is changed and is not the
        // same as it was when it registered to the slot.
        const envDef = this.getEnvDefinitionById(matchedEntry.id);
        if (envDef) {
          return envDef;
        }
        // Do not allow a non existing env
        this.printWarningIfFirstTime(
          matchedEntry.id.toString(),
          `environment with ID: ${matchedEntry.id.toString()} configured on component ${component.id.toString()} was not found`
        );
      }
      // Do not allow configure teambit.envs/envs on the component without configure the env aspect itself
      this.printWarningIfFirstTime(
        envIdFromEnvsConfig,
        `environment with ID: ${envIdFromEnvsConfig} is not configured as extension for the component ${component.id.toString()}`
      );
    }

    // in case there is no config in teambit.envs/envs search the aspects for the first env that registered as env
    let envDefFromList;
    component.state.aspects.entries.find((aspectEntry) => {
      const envDef = this.getEnvDefinitionById(aspectEntry.id);
      if (envDef) {
        envDefFromList = envDef;
      }
      return !!envDef;
    });

    if (envDefFromList) {
      return envDefFromList;
    }
    return this.getDefaultEnv();
  }

  /**
   * @deprecated DO NOT USE THIS METHOD ANYMORE!!! (PLEASE USE .calculateEnv() instead!)
   */
  calculateEnvFromExtensions(extensions: ExtensionDataList): EnvDefinition {
    // Search first for env configured via envs aspect itself
    const envsAspect = extensions.findCoreExtension(EnvsAspect.id);
    const envIdFromEnvsConfig = envsAspect?.config.env;
    if (envIdFromEnvsConfig) {
      const envDef = this.getEnvDefinitionByStringId(envIdFromEnvsConfig);
      if (envDef) {
        return envDef;
      }
    }

    const getEnvDefinitionByLegacyExtension = (extension: ExtensionDataEntry): EnvDefinition | undefined => {
      const envDef = extension.newExtensionId
        ? this.getEnvDefinitionById(extension.newExtensionId)
        : this.getEnvDefinitionByStringId(extension.stringId);
      return envDef;
    };

    // in some cases we have the id configured in the teambit.envs/envs but without the version
    // in such cases we won't find it in the slot
    // we search in the component aspect list a matching aspect which is match the id from the teambit.envs/envs
    if (envIdFromEnvsConfig) {
      const matchedEntry = extensions.find((extension) => {
        if (extension.newExtensionId) {
          return (
            envIdFromEnvsConfig === extension.newExtensionId.toString() ||
            envIdFromEnvsConfig === extension.newExtensionId.toString({ ignoreVersion: true })
          );
        }
        return envIdFromEnvsConfig === extension.stringId;
      });
      if (matchedEntry) {
        // during the tag process, the version in the aspect-entry-id is changed and is not the
        // same as it was when it registered to the slot.
        const envDef = getEnvDefinitionByLegacyExtension(matchedEntry);
        if (envDef) {
          return envDef;
        }
        // Do not allow a non existing env
        this.printWarningIfFirstTime(
          matchedEntry.id.toString(),
          `environment with ID: ${matchedEntry.id.toString()} was not found`
        );
      }
      // Do not allow configure teambit.envs/envs on the component without configure the env aspect itself
      this.printWarningIfFirstTime(
        envIdFromEnvsConfig,
        `environment with ID: ${envIdFromEnvsConfig} is not configured as extension for the component`
      );
    }

    // in case there is no config in teambit.envs/envs search the aspects for the first env that registered as env
    let envDefFromList;
    extensions.find((extension: ExtensionDataEntry) => {
      const envDef = getEnvDefinitionByLegacyExtension(extension);
      if (envDef) {
        envDefFromList = envDef;
      }
      return !!envDef;
    });

    if (envDefFromList) {
      return envDefFromList;
    }
    return this.getDefaultEnv();
  }

  private getEnvDefinitionById(id: ComponentID): EnvDefinition | undefined {
    const envDef =
      this.getEnvDefinitionByStringId(id.toString()) ||
      this.getEnvDefinitionByStringId(id.toString({ ignoreVersion: true }));
    return envDef;
  }

  private getEnvDefinitionByStringId(envId: string): EnvDefinition | undefined {
    const env = this.envSlot.get(envId);
    if (env) {
      return new EnvDefinition(envId, env as Environment);
    }
    return undefined;
  }

  private printWarningIfFirstTime(envId: string, message: string) {
    if (!this.alreadyShownWarning[envId]) {
      this.alreadyShownWarning[envId] = true;
      this.logger.consoleWarning(message);
    }
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
   * register an environment.
   */
  registerEnv(env: Environment) {
    return this.envSlot.register(env);
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
