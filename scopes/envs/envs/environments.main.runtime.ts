import { join } from 'path';
import findRoot from 'find-root';
import { resolveFrom } from '@teambit/toolbox.modules.module-resolver';
import { existsSync, readFileSync } from 'fs-extra';
import pLocate from 'p-locate';
import { parse } from 'comment-json';
import { SourceFile } from '@teambit/component.sources';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { Component, ComponentAspect, ComponentMain } from '@teambit/component';
import type { EnvPolicyConfigObject } from '@teambit/dependency-resolver';
import { GraphqlAspect, GraphqlMain } from '@teambit/graphql';
import { IssuesAspect, IssuesMain } from '@teambit/issues';
import type { EnvJsoncPatterns } from '@teambit/dev-files';
import pMapSeries from 'p-map-series';
import { IssuesClasses } from '@teambit/component-issues';
import { Harmony, Slot, SlotRegistry } from '@teambit/harmony';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import type { AspectDefinition } from '@teambit/aspect-loader';
import { ExtensionDataList, ExtensionDataEntry } from '@teambit/legacy.extension-data';
import { BitError } from '@teambit/bit-error';
import { findDuplications } from '@teambit/toolbox.array.duplications-finder';
import { head, uniq } from 'lodash';
import { WorkerAspect, WorkerMain } from '@teambit/worker';
import { ComponentID } from '@teambit/component-id';
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
import { EnvPlugin } from './env.plugin';

export type EnvJsonc = {
  extends?: string;
  policy?: EnvPolicyConfigObject;
  patterns?: EnvJsoncPatterns;
};

export type EnvJsoncMergeCustomizer = (parentObj: EnvJsonc, childObj: EnvJsonc) => Partial<EnvJsonc>;

export type EnvsRegistry = SlotRegistry<Environment>;
export type EnvJsoncMergeCustomizerRegistry = SlotRegistry<EnvJsoncMergeCustomizer>;

export type EnvsConfig = {
  env: string;
  options: EnvOptions;
};

type GetCalcEnvOptions = {
  skipWarnings?: boolean;
};

export type EnvOptions = {};

export type EnvTransformer = (env: Environment) => Environment;

export type ServicesRegistry = SlotRegistry<Array<EnvService<any>>>;

export type RegularCompDescriptor = {
  id: string;
  icon?: string;
  type?: string;
  name?: string;
  description?: string;
};
export type EnvCompDescriptorProps = RegularCompDescriptor & {
  services?: {
    env: {
      id: string;
      icon: string;
      name?: string;
      description?: string;
    };
    services: Array<{
      id: string;
      name?: string;
      description?: string;
      data: any;
    }>;
  };
};

export type EnvCompDescriptor = EnvCompDescriptorProps & {
  self?: EnvCompDescriptorProps;
};

export type Descriptor = RegularCompDescriptor | EnvCompDescriptor;

export const DEFAULT_ENV = 'teambit.harmony/node';

export class EnvsMain {
  /**
   * Envs that are failed to load
   */
  private failedToLoadEnvs = new Set<string>();
  /**
   * Extensions that are failed to load
   * We use this as sometime when we couldn't load an extension we don't know if it's an env or not
   * We should ideally take it from the aspect loader aspect, but right now the aspect loader is using envs
   */
  private failedToLoadExt = new Set<string>();
  /**
   * Ids of envs (not neccesrraly loaded successfully)
   */
  public envIds = new Set<string>();

  static runtime = MainRuntime;

  private alreadyShownWarning = {};

  private coreAspectIds: string[] = [];

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
    private harmony: Harmony,

    /**
     * slot for allowing extensions to register new environment.
     */
    private envSlot: EnvsRegistry,

    private logger: Logger,

    private servicesRegistry: ServicesRegistry,

    private componentMain: ComponentMain,

    private loggerMain: LoggerMain,

    private workerMain: WorkerMain,

    private envJsoncMergeCustomizerSlot: EnvJsoncMergeCustomizerRegistry
  ) {}

  /**
   * creates a new runtime environments for a set of components.
   */
  async createEnvironment(components: Component[]): Promise<Runtime> {
    return this.createRuntime(components);
  }

  setCoreAspectIds(ids: string[]) {
    this.coreAspectIds = ids;
  }
  isCoreAspect(id: string) {
    return this.coreAspectIds.includes(id);
  }

  /**
   *
   * @param id
   */
  /**
   * This function adds an extension ID to a set of failed to load extensions.
   * This mostly used by the aspect loader to add such issues
   * Then it is used to hide different errors that are caused by the same issue.
   * @param {string} id - string - represents the unique identifier of an extension that failed to load.
   */
  addFailedToLoadEnvs(id: string) {
    this.failedToLoadEnvs.add(id);
    this.envIds.add(id);
  }

  addFailedToLoadExt(id: string) {
    this.failedToLoadExt.add(id);
    if (this.envIds.has(id)) {
      this.addFailedToLoadEnvs(id);
    }
  }

  resetFailedToLoadEnvs() {
    this.failedToLoadEnvs.clear();
    this.failedToLoadExt.clear();
  }

  getFailedToLoadEnvs() {
    const failedToLoadEnvs = Array.from(this.failedToLoadEnvs);
    // Add all extensions which are also envs
    for (const extId of this.failedToLoadExt) {
      if (this.envIds.has(extId)) {
        failedToLoadEnvs.push(extId);
      }
    }
    return uniq(failedToLoadEnvs);
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
      'teambit.harmony/bit-custom-aspect',
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

  /**
   * This function checks if an environment manifest file exists in a given component or set of legacy files.
   * @param {Component} [envComponent] - A component object that represents an environment. It contains information about
   * the files and directories that make up the environment.
   * @param {SourceFile[]} [legacyFiles] - An optional array of SourceFile objects representing the files in the legacy
   * file system. If this parameter is not provided, the function will attempt to retrieve the files from the envComponent
   * parameter.
   * @returns a boolean value indicating whether an `env.jsonc` or `env.json` file exists in the `files` array of either
   * the `envComponent` object or the `legacyFiles` array. If neither `envComponent` nor `legacyFiles` are provided, the
   * function returns `undefined`.
   */
  hasEnvManifest(envComponent?: Component, legacyFiles?: SourceFile[]): boolean | undefined {
    if (!envComponent && !legacyFiles) return undefined;
    // @ts-ignore
    const files = legacyFiles || envComponent.filesystem.files;
    const envJson = files.find((file) => {
      return file.relative === 'env.jsonc' || file.relative === 'env.json';
    });

    if (!envJson) return false;
    return true;
  }

  getEnvManifest(envComponent?: Component, legacyFiles?: SourceFile[]): EnvJsonc | undefined {
    // TODO: maybe throw an error here?
    if (!envComponent && !legacyFiles) return undefined;
    // @ts-ignore
    const files = legacyFiles || envComponent.filesystem.files;
    const envJson = files.find((file) => {
      return file.relative === 'env.jsonc' || file.relative === 'env.json';
    });

    if (!envJson) return undefined;

    const object: EnvJsonc = parse(envJson.contents.toString('utf8'), undefined, true);
    const resolvedObject = this.recursivelyMergeWithParentManifest(object, envJson.path);
    return resolvedObject;
  }

  recursivelyMergeWithParentManifest(object: EnvJsonc, originPath: string): EnvJsonc {
    if (!object.extends) return object;
    const parentPackageName = object.extends;
    const parentPath = resolveFrom(originPath, [parentPackageName]);
    const parentResolvedPath = findRoot(parentPath);
    if (!parentResolvedPath || !existsSync(parentResolvedPath)) {
      this.logger.info(`failed finding parent manifest for ${parentPackageName} at ${parentResolvedPath}`);
    }
    const parentEnvJsoncPath = ['env.jsonc', 'env.json']
      .map((fileName) => join(parentResolvedPath, fileName))
      .find((filePath) => {
        return existsSync(filePath);
      });
    if (!parentEnvJsoncPath) {
      this.logger.consoleWarning(
        `failed finding parent manifest for ${parentPackageName} at ${parentResolvedPath} referred from ${originPath}`
      );
      return object;
    }
    const parentStr = readFileSync(parentEnvJsoncPath).toString('utf8');
    const parentObject: EnvJsonc = parse(parentStr, undefined, true);
    const mergedObject = this.mergeEnvManifests(parentObject, object);
    if (mergedObject.extends) {
      return this.recursivelyMergeWithParentManifest(mergedObject, parentEnvJsoncPath);
    }
    return mergedObject;
  }

  mergeEnvManifests(parent: EnvJsonc, child: EnvJsonc): EnvJsonc {
    let merged: EnvJsonc = {};
    const mergeCustomizer = this.getAllRegisteredEnvJsoncCustomizers();
    for (const customizer of mergeCustomizer) {
      const oneMerged = customizer(parent, child);
      merged = { ...merged, ...oneMerged };
    }
    // Take extends specifically from the parent so we can propagate it to the next parent
    if (parent.extends) {
      merged.extends = parent.extends;
    }
    return merged;
  }

  async hasEnvManifestById(envId: string, requesting: string): Promise<boolean | undefined> {
    const component = await this.getEnvComponentByEnvId(envId, requesting);
    return this.hasEnvManifest(component);
  }

  getEnvData(component: Component): Descriptor {
    let envsData = component.state.aspects.get(EnvsAspect.id);
    if (!envsData) {
      // TODO: remove this once we re-export old components used to store the data here
      envsData = component.state.aspects.get('teambit.workspace/workspace');
    }
    if (!envsData) throw new Error(`env was not configured on component ${component.id.toString()}`);
    return envsData.data as Descriptor;
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

  isUsingCoreEnv(component: Component): boolean {
    const envId = this.getEnvId(component);
    return this.isCoreEnv(envId);
  }

  isCoreEnv(envId: string): boolean {
    return this.getCoreEnvsIds().includes(envId);
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
   * get the env component of the given component.
   */
  async getEnvComponent(component: Component): Promise<Component> {
    const envId = this.getEnvId(component);
    return this.getEnvComponentByEnvId(envId, component.id.toString());
  }

  /**
   * get the env component by the env id.
   */
  async getEnvComponentByEnvId(envId: string, requesting?: string): Promise<Component> {
    const host = this.componentMain.getHost();
    const newId = await host.resolveComponentId(envId);
    const envComponent = await host.get(newId);
    if (!envComponent) {
      throw new BitError(`can't load env. env id is ${envId} used by component ${requesting || 'unknown'}`);
    }
    return envComponent;
  }

  /**
   * get the env of the given component.
   * This will try to use the regular getEnv but fallback to the calculate env (in case you are using it during on load)
   * This is safe to be used on onLoad as well
   */
  getOrCalculateEnv(component: Component): EnvDefinition {
    try {
      return this.getEnv(component);
    } catch {
      return this.calculateEnv(component);
    }
  }

  /**
   * get an environment Descriptor.
   */
  getDescriptor(component: Component): Descriptor | undefined {
    const envsData = this.getEnvData(component);
    envsData.id = this.resolveEnv(component, envsData.id)?.toString() || envsData.id;
    return envsData;
  }

  async calcDescriptor(component: Component, opts: GetCalcEnvOptions = {}): Promise<Descriptor | undefined> {
    const componentDescriptor = await this.getComponentEnvDescriptor(component, opts);
    if (!componentDescriptor) return undefined;
    const envComponentSelfDescriptor = await this.getEnvSelfDescriptor(component);
    const result = envComponentSelfDescriptor
      ? { ...componentDescriptor, self: envComponentSelfDescriptor }
      : componentDescriptor;
    return result;
  }

  /**
   * Get env descriptor from the env itself if the component is an env
   * This will be empty for regular component, and will only contain data for env themself
   */
  private async getEnvSelfDescriptor(envComponent: Component): Promise<EnvCompDescriptorProps | undefined> {
    // !important calculate only on the env itself.
    if (!this.isEnvRegistered(envComponent.id.toString())) {
      return undefined;
    }

    const envDef = this.getEnvFromComponent(envComponent);
    if (!envDef) return undefined;

    const rawServices = this.getServices(envDef);
    const services = rawServices.toObject();
    // const selfDescriptor = (await this.getEnvDescriptorFromEnvDef(envDef)) || {};
    const selfDescriptor = await this.getEnvDescriptorFromEnvDef(envDef);

    if (!selfDescriptor) return undefined;
    return {
      ...selfDescriptor,
      services,
    };
  }

  /**
   * Get env descriptor from the env that a given component is using
   */
  private async getComponentEnvDescriptor(
    component: Component,
    opts: GetCalcEnvOptions = {}
  ): Promise<RegularCompDescriptor | undefined> {
    const envDef = this.calculateEnv(component, opts);
    return this.getEnvDescriptorFromEnvDef(envDef);
  }

  private async getEnvDescriptorFromEnvDef(envDef: EnvDefinition): Promise<RegularCompDescriptor | undefined> {
    if (!envDef.env.__getDescriptor || typeof envDef.env.__getDescriptor !== 'function') {
      return undefined;
    }
    const systemDescriptor = await envDef.env.__getDescriptor();

    return {
      type: systemDescriptor.type,
      // Make sure to store the env id in the data without the version
      // The version should always come from the aspect id configured on the component
      id: envDef.id.split('@')[0],
      name: envDef.name,
      icon: envDef.env.icon,
      description: envDef.description,
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
  async calculateEnvId(component: Component): Promise<ComponentID> {
    // Search first for env configured via envs aspect itself
    const envIdFromEnvsConfig = this.getEnvIdFromEnvsConfig(component);
    // if (!envIdFromEnvsConfig) return this.getDefaultEnv();
    const envIdFromEnvsConfigWithoutVersion = envIdFromEnvsConfig
      ? ComponentID.fromString(envIdFromEnvsConfig).toStringWithoutVersion()
      : undefined;

    if (envIdFromEnvsConfig && this.isCoreEnv(envIdFromEnvsConfig)) {
      return ComponentID.fromString(envIdFromEnvsConfig);
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

      if (matchedEntry?.id) return matchedEntry?.id;
    }

    // in case there is no config in teambit.envs/envs search the aspects for the first env that registered as env
    let ids: string[] = [];
    component.state.aspects.entries.forEach((aspectEntry) => {
      ids.push(aspectEntry.id.toString());
      // ids.push(aspectEntry.id.toString({ ignoreVersion: true }));
    });
    ids = uniq(ids);
    const envId = await this.findFirstEnv(ids);
    const finalId = envId || this.getDefaultEnv().id;
    return ComponentID.fromString(finalId);
  }

  /**
   * This used to calculate the actual env during the component load.
   * Do not use it to get the env (use getEnv instead)
   * This should be used only during on load
   */
  calculateEnv(component: Component, opts: GetCalcEnvOptions = {}): EnvDefinition {
    // Search first for env configured via envs aspect itself
    const envIdFromEnvsConfig = this.getEnvIdFromEnvsConfig(component);
    let envIdFromEnvsConfigWithoutVersion;
    if (envIdFromEnvsConfig) {
      envIdFromEnvsConfigWithoutVersion = ComponentID.fromString(envIdFromEnvsConfig).toStringWithoutVersion();
      const envDef = this.getEnvDefinitionByStringId(envIdFromEnvsConfigWithoutVersion);
      if (envDef) {
        this.envIds.add(envDef.id);
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
          this.envIds.add(envDef.id);
          return envDef;
        }
        if (!opts.skipWarnings) {
          // Do not allow a non existing env
          this.printWarningIfFirstTime(
            matchedEntry.id.toString(),
            `environment with ID: ${matchedEntry.id.toString()} configured on component ${component.id.toString()} was not loaded (run "bit install")`
          );
        }
      }
      // Do not allow configure teambit.envs/envs on the component without configure the env aspect itself
      // const errMsg = new EnvNotConfiguredForComponent(envIdFromEnvsConfig as string, component.id.toString()).message;
      // this.printWarningIfFirstTime(envIdFromEnvsConfig as string, errMsg);
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
      this.envIds.add(envDefFromList.id);
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

  getAllRegisteredEnvsIds(): string[] {
    return this.envSlot.toArray().map((envData) => envData[0]);
  }

  getAllRegisteredEnvs(): Environment[] {
    return this.envSlot.toArray().map((envData) => envData[1]);
  }

  getAllRegisteredEnvJsoncCustomizers(): EnvJsoncMergeCustomizer[] {
    return this.envJsoncMergeCustomizerSlot.toArray().map((customizerEntry) => customizerEntry[1]);
  }

  getEnvPlugin() {
    return new EnvPlugin(this.envSlot, this.servicesRegistry, this.loggerMain, this.workerMain, this.harmony);
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

  getEnvIdFromEnvsLegacyExtensions(extensions: ExtensionDataList): string | undefined {
    const envsAspect = extensions.findCoreExtension(EnvsAspect.id);
    const envIdFromEnvsConfig = envsAspect?.data.id;
    return envIdFromEnvsConfig;
  }

  /**
   * @deprecated DO NOT USE THIS METHOD ANYMORE!!! (PLEASE USE .calculateEnvId() instead!)
   */
  async calculateEnvIdFromExtensions(extensions: ExtensionDataList): Promise<string> {
    // Search first for env configured via envs aspect itself
    const envsAspect = extensions.findCoreExtension(EnvsAspect.id);
    const envIdFromEnvsConfig = envsAspect?.config.env;

    const envIdFromEnvsConfigWithoutVersion = envIdFromEnvsConfig
      ? ComponentID.fromString(envIdFromEnvsConfig).toStringWithoutVersion()
      : undefined;

    if (envIdFromEnvsConfig && this.isCoreEnv(envIdFromEnvsConfig)) {
      return envIdFromEnvsConfig;
    }

    // in some cases we have the id configured in the teambit.envs/envs but without the version
    // in such cases we won't find it in the slot
    // we search in the component aspect list a matching aspect which is match the id from the teambit.envs/envs
    if (envIdFromEnvsConfigWithoutVersion) {
      const matchedEntry = extensions.find((extension) => {
        if (extension.extensionId) {
          return (
            envIdFromEnvsConfigWithoutVersion === extension.extensionId.toString() ||
            envIdFromEnvsConfigWithoutVersion === extension.extensionId.toString({ ignoreVersion: true })
          );
        }
        return envIdFromEnvsConfigWithoutVersion === extension.stringId;
      });
      if (matchedEntry?.id) return matchedEntry?.stringId;
    }

    // in case there is no config in teambit.envs/envs search the aspects for the first env that registered as env
    const ids: string[] = [];
    extensions.forEach((extension) => {
      if (extension.extensionId) {
        ids.push(extension.extensionId.toString());
      } else {
        ids.push(extension.stringId);
      }
    });
    const envId = await this.findFirstEnv(ids);
    const finalId = envId || this.getDefaultEnv().id;
    return finalId;
  }

  /**
   * @deprecated DO NOT USE THIS METHOD ANYMORE!!! (PLEASE USE .calculateEnv() instead!)
   */
  async calculateEnvFromExtensions(extensions: ExtensionDataList): Promise<EnvDefinition> {
    // Search first for env configured via envs aspect itself
    const envsAspect = extensions.findCoreExtension(EnvsAspect.id);
    const envIdFromEnvsConfig = envsAspect?.config.env;
    let envIdFromEnvsConfigWithoutVersion;

    if (envIdFromEnvsConfig) {
      envIdFromEnvsConfigWithoutVersion = ComponentID.fromString(envIdFromEnvsConfig).toStringWithoutVersion();
      const envDef = this.getEnvDefinitionByStringId(envIdFromEnvsConfigWithoutVersion);
      if (envDef) {
        this.envIds.add(envDef.id);
        return envDef;
      }
    }

    // in some cases we have the id configured in the teambit.envs/envs but without the version
    // in such cases we won't find it in the slot
    // we search in the component aspect list a matching aspect which is match the id from the teambit.envs/envs
    if (envIdFromEnvsConfigWithoutVersion) {
      const matchedEntry = extensions.find((extension) => {
        if (extension.extensionId) {
          return (
            envIdFromEnvsConfigWithoutVersion === extension.extensionId.toString() ||
            envIdFromEnvsConfigWithoutVersion === extension.extensionId.toString({ ignoreVersion: true })
          );
        }
        return envIdFromEnvsConfigWithoutVersion === extension.stringId;
      });
      if (matchedEntry) {
        // during the tag process, the version in the aspect-entry-id is changed and is not the
        // same as it was when it registered to the slot.
        const envDef = this.getEnvDefinitionByLegacyExtension(matchedEntry);
        if (envDef) {
          this.envIds.add(envDef.id);
          return envDef;
        }
        // Do not allow a non existing env
        // this.printWarningIfFirstTime(
        //   matchedEntry.id.toString(),
        //   `environment with ID: ${matchedEntry.id.toString()} was not found`
        // );
      }
      // Do not allow configure teambit.envs/envs on the component without configure the env aspect itself
      // const errMsg = new EnvNotConfiguredForComponent(envIdFromEnvsConfig).message;
      // this.printWarningIfFirstTime(envIdFromEnvsConfig, errMsg);
    }

    // in case there is no config in teambit.envs/envs search the aspects for the first env that registered as env
    const ids: string[] = [];
    extensions.forEach((extension) => {
      if (extension.extensionId) {
        ids.push(extension.extensionId.toString());
      } else {
        ids.push(extension.stringId);
      }
    });
    const envId = await this.findFirstEnv(ids);
    const envDef = envId ? this.getEnvDefinitionByStringId(envId) : undefined;

    return envDef || this.getDefaultEnv();
  }

  /**
   * This function finds the first environment ID from a list of IDs by checking if it is register as env (to the slot).
   * or contains env.jsonc file
   * @param {string[]} ids - `ids` is an array of string values representing environment IDs. The function `findFirstEnv`
   * takes this array as input and returns a Promise that resolves to a string value representing the first environment ID
   * that matches certain conditions.
   * @returns The `findFirstEnv` function returns a Promise that resolves to a string or undefined. The string represents
   * the ID of the first environment that matches the conditions specified in the function, or undefined if no environment
   * is found.
   */
  private async findFirstEnv(ids: string[]): Promise<string | undefined> {
    let isFoundWithoutVersion = false;
    const envId = await pLocate(ids, async (id) => {
      const idWithoutVersion = id.split('@')[0];
      if (this.isCoreEnv(idWithoutVersion)) return true;
      if (this.isCoreAspect(idWithoutVersion)) return false;
      const envDef = this.getEnvDefinitionByStringId(id);
      if (envDef) return true;
      const envDefWithoutVersion = this.getEnvDefinitionByStringId(idWithoutVersion);
      if (envDefWithoutVersion) {
        isFoundWithoutVersion = true;
        return true;
      }
      const envComponent = await this.getEnvComponentByEnvId(id);
      const hasManifest = this.hasEnvManifest(envComponent);
      if (hasManifest) return true;
      const isUsingEnvEnv = this.isUsingEnvEnv(envComponent);
      return !!isUsingEnvEnv;
    });
    let finalEnvId;
    if (envId) {
      finalEnvId = isFoundWithoutVersion ? envId?.split('@')[0] : envId;
      this.envIds.add(envId);
    }
    return finalEnvId;
  }

  private getEnvDefinitionByLegacyExtension(extension: ExtensionDataEntry): EnvDefinition | undefined {
    const envDef = extension.extensionId
      ? this.getEnvDefinitionById(extension.extensionId)
      : this.getEnvDefinitionByStringId(extension.stringId);
    return envDef;
  }

  getEnvIdFromEnvsConfig(component: Component): string | undefined {
    const envsAspect = component.state.aspects.get(EnvsAspect.id);
    return envsAspect?.config.env;
  }

  getEnvDefinition(id: ComponentID) {
    const allVersions = this.envSlot.toArray();
    const all = allVersions.filter(([envId]) => envId.includes(id.toStringWithoutVersion()));
    const first = head(all);
    if (!first) return undefined;
    const [envId, env] = first;
    return new EnvDefinition(envId, env);
  }

  getEnvDefinitionById(id: ComponentID): EnvDefinition | undefined {
    const envDef =
      this.getEnvDefinitionByStringId(id.toString()) ||
      this.getEnvDefinitionByStringId(id.toString({ ignoreVersion: true }));
    return envDef;
  }

  public getEnvDefinitionByStringId(envId: string): EnvDefinition | undefined {
    const env = this.envSlot.get(envId);
    if (env) {
      return new EnvDefinition(envId, env as Environment);
    }
    return undefined;
  }

  getEnvFromComponent(envComponent: Component): EnvDefinition | undefined {
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
    if (!this.alreadyShownWarning[envId] && !this.failedToLoadEnvs.has(envId)) {
      this.alreadyShownWarning[envId] = true;
      this.logger.consoleWarning(message);
      this.addFailedToLoadEnvs(envId);
    }
  }

  /**
   * determines whether an env is registered.
   */
  public isEnvRegistered(id: string) {
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
   * Check if the given component is an env component.
   * @param component
   * @returns
   */
  isEnv(component: Component): boolean {
    return (
      this.isUsingEnvEnv(component) ||
      this.isEnvRegistered(component.id.toString()) ||
      this.isEnvRegistered(component.id.toStringWithoutVersion())
    );
  }

  /**
   * register a new environment service.
   */
  registerService(...envServices: EnvService<any>[]) {
    this.servicesRegistry.register(envServices);
    return this;
  }

  /**
   * get list of services enabled on an env.
   */
  getServices(env: EnvDefinition): EnvServiceList {
    const allServices = this.servicesRegistry.toArray();
    const services: [string, EnvService<any>][] = [];
    allServices.forEach(([id, currentServices]) => {
      currentServices.forEach((service) => {
        try {
          if (this.implements(env, service)) {
            services.push([id, service]);
          }
        } catch {
          this.logger.warn(`failed loading service ${id} for env ${env.id}`);
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

  /**
   * register an env.jsonc merge customizer.
   */
  registerEnvJsoncMergeCustomizer(customizer: EnvJsoncMergeCustomizer) {
    return this.envJsoncMergeCustomizerSlot.register(customizer);
  }

  async addNonLoadedEnvAsComponentIssues(components: Component[]) {
    await pMapSeries(components, async (component) => {
      const envId = await this.calculateEnvId(component);
      const envIdStr = envId.toString();
      if (!this.isEnvRegistered(envIdStr)) {
        this.addFailedToLoadEnvs(envIdStr);
        // If there is no version and the env is not in the workspace this is not valid
        // you can't set external env without version
        if (!envIdStr.includes('@')) {
          const foundComp = components.find((c) => c.id.toStringWithoutVersion() === envIdStr);
          if (!foundComp) {
            component.state.issues.getOrCreate(IssuesClasses.ExternalEnvWithoutVersion).data = {
              envId: envIdStr,
              componentId: component.id.toString(),
            };
          } else {
            component.state.issues.getOrCreate(IssuesClasses.NonLoadedEnv).data = envIdStr;
          }
        } else {
          component.state.issues.getOrCreate(IssuesClasses.NonLoadedEnv).data = envIdStr;
        }
      }
    });
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
    // We don't want to filter by runtime here as we want to also get envs that configured as plugins. so they don't
    // contain the runtime path.
    const resolvedAspects = await host.resolveAspects(MainRuntime.name, [id], {
      requestedOnly: true,
      filterByRuntime: false,
      useScopeAspectsCapsule: true,
    });
    const def = resolvedAspects[0];

    return def;
  }

  private throwForDuplicateComponents(components: Component[]) {
    const idsStr = components.map((c) => c.id.toString());
    const duplications = findDuplications(idsStr);
    if (duplications.length) {
      throw new Error(`found duplicated components: ${duplications.join(', ')}`);
    }
  }

  static slots = [
    Slot.withType<Environment>(),
    Slot.withType<EnvService<any>>(),
    Slot.withType<EnvJsoncMergeCustomizerRegistry>(),
  ];

  static dependencies = [GraphqlAspect, LoggerAspect, ComponentAspect, CLIAspect, WorkerAspect, IssuesAspect];

  static async provider(
    [graphql, loggerAspect, component, cli, worker, issues]: [
      GraphqlMain,
      LoggerMain,
      ComponentMain,
      CLIMain,
      WorkerMain,
      IssuesMain,
    ],
    config: EnvsConfig,
    [envSlot, servicesRegistry, envJsoncMergeCustomizerSlot]: [
      EnvsRegistry,
      ServicesRegistry,
      EnvJsoncMergeCustomizerRegistry,
    ],
    context: Harmony
  ) {
    const logger = loggerAspect.createLogger(EnvsAspect.id);
    const envs = new EnvsMain(
      config,
      context,
      envSlot,
      logger,
      servicesRegistry,
      component,
      loggerAspect,
      worker,
      envJsoncMergeCustomizerSlot
    );
    component.registerShowFragments([new EnvFragment(envs)]);
    if (issues) issues.registerAddComponentsIssues(envs.addNonLoadedEnvAsComponentIssues.bind(envs));

    const envsCmd = new EnvsCmd(envs, component);
    envsCmd.commands = [new ListEnvsCmd(envs, component), new GetEnvCmd(envs, component)];
    cli.register(envsCmd);
    graphql.register(environmentsSchema(envs));
    return envs;
  }
}

EnvsAspect.addRuntime(EnvsMain);
