import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { Component, ComponentAspect, ComponentMain, ComponentID, AspectData } from '@teambit/component';
import { GraphqlAspect, GraphqlMain } from '@teambit/graphql';
import { Harmony, Slot, SlotRegistry } from '@teambit/harmony';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import type { AspectDefinition } from '@teambit/aspect-loader';
import { ExtensionDataList, ExtensionDataEntry } from '@teambit/legacy/dist/consumer/config/extension-data';
import findDuplications from '@teambit/legacy/dist/utils/array/find-duplications';
import { BitId } from '@teambit/legacy-bit-id';
import { EnvService } from './services';
import { Environment } from './environment';
import { EnvsAspect } from './environments.aspect';
import { environmentsSchema } from './environments.graphql';
import { EnvRuntime, Runtime } from './runtime';
import { EnvDefinition } from './env-definition';
import { EnvServiceList } from './env-service-list';
import { EnvsCmd, GetEnvCmd, ListEnvsCmd } from './envs.cmd';
import { EnvFragment } from './env.fragment';
import { EnvNotFound, EnvNotConfiguredForComponent } from './exceptions';

export type EnvsRegistry = SlotRegistry<Environment>;

export type EnvsConfig = {
  env: string;
  options: EnvOptions;
};

export type EnvOptions = {};

export type EnvTransformer = (env: Environment) => Environment;

export type ServiceSlot = SlotRegistry<Array<EnvService<any>>>;

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

  getCoreEnvsIds(): string[] {
    return [
      'teambit.harmony/aspect',
      'teambit.react/react',
      'teambit.harmony/node',
      'teambit.react/react-native',
      'teambit.html/html',
      'teambit.mdx/mdx',
      'teambit.envs/env',
      'teambit.mdx/readme',
    ];
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
  merge<T extends Environment, S extends Environment>(targetEnv: Environment, sourceEnv: Environment): T & S {
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

    return targetEnv as T & S;
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
   * Return the id of the env as configured in the envs data (without version by default)
   * The reason it's not contain version by default is that we want to take the version from the aspect defined on the component itself
   * As this version is stay up to date during tagging the env along with the component
   * @param component
   * @param ignoreVersion
   */
  private getEnvIdFromEnvsData(component: Component, ignoreVersion = true): string | undefined {
    const envsData = this.getEnvData(component);
    if (!envsData) return undefined;
    const rawEnvId = envsData.id;
    if (!rawEnvId) return undefined;
    if (!ignoreVersion) return rawEnvId;
    const envIdWithoutVersion = ComponentID.fromString(rawEnvId).toStringWithoutVersion();
    return envIdWithoutVersion;
  }

  /**
   * get the env id of the given component.
   */
  getEnvId(component: Component): string {
    const envIdFromEnvData = this.getEnvIdFromEnvsData(component);
    if (!envIdFromEnvData) {
      // This should never happen
      throw new Error(`no env found for ${component.id.toString()}`);
    }
    const withVersion = this.resolveEnv(component, envIdFromEnvData);
    const withVersionMatch = this.envSlot.toArray().find(([envId]) => {
      return withVersion?.toString() === envId;
    });
    const withVersionMatchId = withVersionMatch?.[0];
    if (withVersionMatchId) return withVersionMatchId;

    // Handle core envs
    const exactMatch = this.envSlot.toArray().find(([envId]) => {
      return envIdFromEnvData === envId;
    });

    const exactMatchId = exactMatch?.[0];
    if (exactMatchId) return exactMatchId;

    if (!withVersion) throw new EnvNotConfiguredForComponent(envIdFromEnvData, component.id.toString());
    return withVersion.toString();
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
   * get the env of the given component.
   * This will try to use the regular getEnv but fallback to the calculate env (in case you are using it during on load)
   * This is safe to be used on onLoad as well
   */
  getOrCalculateEnv(component: Component): EnvDefinition {
    try {
      return this.getEnv(component);
    } catch (err) {
      return this.calculateEnv(component);
    }
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

  resolveEnv(component: Component, id: string) {
    const matchedEntry = component.state.aspects.entries.find((aspectEntry) => {
      return id === aspectEntry.id.toString() || id === aspectEntry.id.toString({ ignoreVersion: true });
    });

    return matchedEntry?.id;
  }

  /**
   * This used to calculate the actual env during the component load.
   * Do not use it to get the env (use getEnv instead)
   * This should be used only during on load
   */
  calculateEnv(component: Component): EnvDefinition {
    // Search first for env configured via envs aspect itself
    const envIdFromEnvsConfig = this.getEnvIdFromEnvsConfig(component);
    let envIdFromEnvsConfigWithoutVersion;
    if (envIdFromEnvsConfig) {
      envIdFromEnvsConfigWithoutVersion = ComponentID.fromString(envIdFromEnvsConfig).toStringWithoutVersion();
      const envDef = this.getEnvDefinitionByStringId(envIdFromEnvsConfigWithoutVersion);
      if (envDef) {
        return envDef;
      }
    }

    // in some cases we have the id configured in the teambit.envs/envs but without the version
    // in such cases we won't find it in the slot
    // we search in the component aspect list a matching aspect which is match the id from the teambit.envs/envs
    if (envIdFromEnvsConfigWithoutVersion) {
      const matchedEntry = component.state.aspects.entries.find((aspectEntry) => {
        return (
          envIdFromEnvsConfigWithoutVersion === aspectEntry.id.toString() ||
          envIdFromEnvsConfigWithoutVersion === aspectEntry.id.toString({ ignoreVersion: true })
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
      const errMsg = new EnvNotConfiguredForComponent(envIdFromEnvsConfig as string, component.id.toString()).message;
      this.printWarningIfFirstTime(envIdFromEnvsConfig as string, errMsg);
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
   * an env can be configured on a component in two ways:
   * 1) explicitly inside "teambit.envs/envs". `{ "teambit.envs/envs": { "env": "my-env" } }`
   * 2) the env aspect is set on the variant as any other aspect, e.g. `{ "my-env": {} }`
   *
   * this method returns #1 if exists, otherwise, #2.
   */
  getAllEnvsConfiguredOnComponent(component: Component): EnvDefinition[] {
    // if a component has "envs" config, use it and ignore other components that are set up
    // in this components which happen to be envs.
    const envDef = this.getEnvFromEnvsConfig(component);
    if (envDef) {
      return [envDef];
    }

    return this.getEnvsNotFromEnvsConfig(component);
  }

  /**
   * whether a component has an env configured (either by variant or .bitmap).
   */
  hasEnvConfigured(component: Component): boolean {
    return Boolean(this.getAllEnvsConfiguredOnComponent(component).length);
  }

  getAllRegisteredEnvs(): string[] {
    return this.envSlot.toArray().map((envData) => envData[0]);
  }

  /**
   * an env can be configured on a component in two ways:
   * 1) explicitly inside "teambit.envs/envs". `{ "teambit.envs/envs": { "env": "my-env" } }`
   * 2) the env aspect is set on the variant as any other aspect, e.g. `{ "my-env": {} }`
   *
   * this method returns only #1
   */
  getEnvFromEnvsConfig(component: Component): EnvDefinition | undefined {
    const envIdFromEnvsConfig = this.getEnvIdFromEnvsConfig(component);
    if (!envIdFromEnvsConfig) {
      return undefined;
    }
    const envIdFromEnvsConfigWithoutVersion = ComponentID.fromString(envIdFromEnvsConfig).toStringWithoutVersion();
    const envDef = this.getEnvDefinitionByStringId(envIdFromEnvsConfigWithoutVersion);
    return envDef;
  }

  /**
   * an env can be configured on a component in two ways:
   * 1) explicitly inside "teambit.envs/envs". `{ "teambit.envs/envs": { "env": "my-env" } }`
   * 2) the env aspect is set on the variant as any other aspect, e.g. `{ "my-env": {} }`
   *
   * this method returns only #2
   */
  getEnvsNotFromEnvsConfig(component: Component): EnvDefinition[] {
    return component.state.aspects.entries.reduce((acc: EnvDefinition[], aspectEntry) => {
      const envDef = this.getEnvDefinitionById(aspectEntry.id);
      if (envDef) acc.push(envDef);
      return acc;
    }, []);
  }

  /**
   * @deprecated DO NOT USE THIS METHOD ANYMORE!!! (PLEASE USE .calculateEnv() instead!)
   */
  calculateEnvFromExtensions(extensions: ExtensionDataList): EnvDefinition {
    // Search first for env configured via envs aspect itself
    const envsAspect = extensions.findCoreExtension(EnvsAspect.id);
    const envIdFromEnvsConfig = envsAspect?.config.env;
    let envIdFromEnvsConfigWithoutVersion;

    if (envIdFromEnvsConfig) {
      envIdFromEnvsConfigWithoutVersion = ComponentID.fromString(envIdFromEnvsConfig).toStringWithoutVersion();
      const envDef = this.getEnvDefinitionByStringId(envIdFromEnvsConfigWithoutVersion);
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
    if (envIdFromEnvsConfigWithoutVersion) {
      const matchedEntry = extensions.find((extension) => {
        if (extension.newExtensionId) {
          return (
            envIdFromEnvsConfigWithoutVersion === extension.newExtensionId.toString() ||
            envIdFromEnvsConfigWithoutVersion === extension.newExtensionId.toString({ ignoreVersion: true })
          );
        }
        return envIdFromEnvsConfigWithoutVersion === extension.stringId;
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
      const errMsg = new EnvNotConfiguredForComponent(envIdFromEnvsConfig).message;
      this.printWarningIfFirstTime(envIdFromEnvsConfig, errMsg);
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

  private getEnvIdFromEnvsConfig(component: Component): string | undefined {
    const envsAspect = component.state.aspects.get(EnvsAspect.id);
    return envsAspect?.config.env;
  }

  getEnvDefinitionById(id: ComponentID): EnvDefinition | undefined {
    const envDef =
      this.getEnvDefinitionByStringId(id.toString()) ||
      this.getEnvDefinitionByStringId(id.toString({ ignoreVersion: true }));
    return envDef;
  }

  async getEnvDefinitionByLegacyId(id: BitId): Promise<EnvDefinition | undefined> {
    const host = this.componentMain.getHost();
    const newId = await host.resolveComponentId(id);
    return this.getEnvDefinitionById(newId);
  }

  private getEnvDefinitionByStringId(envId: string): EnvDefinition | undefined {
    const env = this.envSlot.get(envId);
    if (env) {
      return new EnvDefinition(envId, env as Environment);
    }
    return undefined;
  }

  getEnvFromComponent(envComponent: Component) {
    const env = this.getEnvDefinitionById(envComponent.id);
    return env;
  }

  /**
   * Return the env definition of teambit.envs/env
   */
  getEnvsEnvDefinition(): EnvDefinition {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.getEnvDefinitionByStringId('teambit.envs/env')!;
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

  isUsingAspectEnv(component: Component): boolean {
    const data = this.getEnvData(component);
    if (!data) return false;
    return data.type === 'aspect';
  }

  isUsingEnvEnv(component: Component): boolean {
    const data = this.getEnvData(component);
    if (!data) return false;
    return data.type === 'env';
  }

  /**
   * register a new environment service.
   */
  registerService(...envServices: EnvService<any>[]) {
    this.serviceSlot.register(envServices);
    return this;
  }

  /**
   * get list of services enabled on an env.
   */
  getServices(env: EnvDefinition): EnvServiceList {
    const allServices = this.serviceSlot.toArray();
    const services: [string, EnvService<any>][] = [];
    allServices.forEach(([id, currentServices]) => {
      currentServices.forEach((service) => {
        if (this.implements(env, service)) {
          services.push([id, service]);
        }
      });
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
  private async createRuntime(components: Component[]): Promise<Runtime> {
    return new Runtime(await this.aggregateByDefs(components), this.logger);
  }

  // :TODO can be refactored to few utilities who will make repeating this very easy.
  private async aggregateByDefs(components: Component[]): Promise<EnvRuntime[]> {
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

    return Promise.all(
      Object.keys(envsMap).map(async (key) => {
        const envAspectDef = await this.getEnvAspectDef(key);
        return new EnvRuntime(key, envsMap[key].env, envsMap[key].components, envAspectDef);
      })
    );
  }

  private async getEnvAspectDef(envId: string): Promise<AspectDefinition> {
    const host = this.componentMain.getHost();
    const id = await host.resolveComponentId(envId);
    const def = (await host.resolveAspects(MainRuntime.name, [id], { requestedOnly: true }))[0];
    return def;
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
    const envsCmd = new EnvsCmd(envs, component);
    envsCmd.commands = [new ListEnvsCmd(envs, component), new GetEnvCmd(envs, component)];
    cli.register(envsCmd);
    graphql.register(environmentsSchema(envs));
    return envs;
  }
}

EnvsAspect.addRuntime(EnvsMain);
