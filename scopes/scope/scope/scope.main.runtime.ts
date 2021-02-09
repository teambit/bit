import mapSeries from 'p-map-series';
import type { AspectLoaderMain } from '@teambit/aspect-loader';
import { difference } from 'ramda';
import { TaskResultsList, BuilderData, BuilderAspect } from '@teambit/builder';
import { readdirSync } from 'fs-extra';
import { resolve, join } from 'path';
import { AspectLoaderAspect, AspectDefinition } from '@teambit/aspect-loader';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import type { ComponentMain, ComponentMap } from '@teambit/component';
import {
  Component,
  ComponentAspect,
  ComponentFactory,
  ComponentFS,
  ComponentID,
  Config,
  Snap,
  State,
  Tag,
  TagMap,
} from '@teambit/component';
import type { GraphqlMain } from '@teambit/graphql';
import { GraphqlAspect } from '@teambit/graphql';
import { Harmony, Slot, SlotRegistry } from '@teambit/harmony';
import { IsolatorAspect, IsolatorMain } from '@teambit/isolator';
import { LoggerAspect, LoggerMain, Logger } from '@teambit/logger';
import { ExpressAspect, ExpressMain } from '@teambit/express';
import type { UiMain } from '@teambit/ui';
import { UIAspect } from '@teambit/ui';
import { RequireableComponent } from '@teambit/modules.requireable-component';
import { BitId } from '@teambit/legacy-bit-id';
import { BitIds as ComponentsIds } from 'bit-bin/dist/bit-id';
import { ModelComponent, Version, Lane } from 'bit-bin/dist/scope/models';
import { Ref, Repository } from 'bit-bin/dist/scope/objects';
import LegacyScope, { LegacyOnTagResult, OnTagFunc, OnTagOpts } from 'bit-bin/dist/scope/scope';
import { ComponentLog } from 'bit-bin/dist/scope/models/model-component';
import { loadScopeIfExist } from 'bit-bin/dist/scope/scope-loader';
import { PersistOptions } from 'bit-bin/dist/scope/types';
import LegacyGraph from 'bit-bin/dist/scope/graph/graph';
import { ExportPersist, PostSign } from 'bit-bin/dist/scope/actions';
import { getScopeRemotes } from 'bit-bin/dist/scope/scope-remotes';
import { Remotes } from 'bit-bin/dist/remotes';
import { Scope } from 'bit-bin/dist/scope';
import { Http, DEFAULT_AUTH_TYPE, AuthData } from 'bit-bin/dist/scope/network/http/http';
import { buildOneGraphForComponentsUsingScope } from 'bit-bin/dist/scope/graph/components-graph';
import ConsumerComponent from 'bit-bin/dist/consumer/component';
import { resumeExport } from 'bit-bin/dist/scope/component-ops/export-scope-components';
import { ExtensionDataEntry } from 'bit-bin/dist/consumer/config';
import { compact, slice, uniqBy } from 'lodash';
import semver, { SemVer } from 'semver';
import { ComponentNotFound } from './exceptions';
import { ExportCmd } from './export/export-cmd';
import { ScopeAspect } from './scope.aspect';
import { scopeSchema } from './scope.graphql';
import { ScopeUIRoot } from './scope.ui-root';
import { PutRoute, FetchRoute, ActionRoute, DeleteRoute } from './routes';
import { ResumeExportCmd } from './export/resume-export-cmd';

type TagRegistry = SlotRegistry<OnTag>;

export type OnTagResults = { builderDataMap: ComponentMap<BuilderData>; pipeResults: TaskResultsList[] };
export type OnTag = (components: Component[], options?: OnTagOpts) => Promise<OnTagResults>;

type RemoteEventMetadata = { auth?: AuthData; clientBitVersion?: string };
type RemoteEvent<Data> = (data: Data, metadata: RemoteEventMetadata, errors?: Array<string | Error>) => Promise<void>;
type OnPostPutData = { ids: ComponentID[]; lanes: Lane[] };
type OnPrePersistExportData = { clientId: string; scopes: string[] };

type OnPostPut = RemoteEvent<OnPostPutData>;
type OnPostExport = RemoteEvent<OnPostPutData>;
type OnPostObjectsPersist = RemoteEvent<undefined>;
type OnPrePersistExport = RemoteEvent<OnPrePersistExportData>;

export type OnPostPutSlot = SlotRegistry<OnPostPut>;
export type OnPostExportSlot = SlotRegistry<OnPostExport>;
export type OnPostObjectsPersistSlot = SlotRegistry<OnPostObjectsPersist>;
export type OnPrePersistExportSlot = SlotRegistry<OnPrePersistExport>;

export type ScopeConfig = {
  description: string;
  icon: string;
};

export class ScopeMain implements ComponentFactory {
  constructor(
    /**
     * private reference to the instance of Harmony.
     */
    private harmony: Harmony,
    /**
     * legacy scope
     */
    readonly legacyScope: LegacyScope,

    /**
     * component extension.
     */
    readonly componentExtension: ComponentMain,

    /**
     * slot registry for subscribing to build
     */
    private tagRegistry: TagRegistry,

    private postPutSlot: OnPostPutSlot,

    private postExportSlot: OnPostExportSlot,

    private postObjectsPersist: OnPostObjectsPersistSlot,

    private prePersistExportSlot: OnPrePersistExportSlot,

    private isolator: IsolatorMain,

    private aspectLoader: AspectLoaderMain,

    private config: ScopeConfig,

    private logger: Logger
  ) {}

  /**
   * name of the scope
   */
  get name(): string {
    return this.legacyScope.name;
  }

  get icon(): string {
    return this.config.icon;
  }

  get description(): string {
    return this.config.description;
  }

  get path(): string {
    return this.legacyScope.path;
  }

  get isLegacy(): boolean {
    return this.legacyScope.isLegacy;
  }

  /**
   * register to the tag slot.
   */
  onTag(tagFn: OnTag) {
    const host = this.componentExtension.getHost();

    // Return only aspects that defined on components but not in the root config file (workspace.jsonc/scope.jsonc)
    const getAspectsIdsWithoutRootIds = (): string[] => {
      const allIds = this.harmony.extensionsIds;
      const rootIds = Object.keys(this.harmony.config.toObject());
      const diffIds = difference(allIds, rootIds);
      return diffIds;
    };

    // Based on the list of components to be tagged return those who are loaded to harmony with their used version
    const getAspectsByPreviouslyUsedVersion = async (components: ConsumerComponent[]): Promise<string[]> => {
      const harmonyIds = getAspectsIdsWithoutRootIds();
      const aspectsIds: string[] = [];
      const aspectsP = components.map(async (component) => {
        const newId = await host.resolveComponentId(component.id);
        if (
          component.previouslyUsedVersion &&
          component.version &&
          component.previouslyUsedVersion !== component.version
        ) {
          const newIdWithPreviouslyUsedVersion = newId.changeVersion(component.previouslyUsedVersion);
          if (harmonyIds.includes(newIdWithPreviouslyUsedVersion.toString())) {
            aspectsIds.push(newId.toString());
          }
        }
      });
      await Promise.all(aspectsP);
      return aspectsIds;
    };

    // Reload the aspects with their new version
    const reloadAspectsWithNewVersion = async (components: ConsumerComponent[]): Promise<void> => {
      const idsToLoad = await getAspectsByPreviouslyUsedVersion(components);
      await host.loadAspects(idsToLoad, false);
    };

    const legacyOnTagFunc: OnTagFunc = async (
      legacyComponents: ConsumerComponent[],
      options?: OnTagOpts
    ): Promise<LegacyOnTagResult[]> => {
      // We need to reload the aspects with their new version since:
      // during get many by legacy, we go load component which in turn go to getEnv
      // get env validates that the env written on the component is really exist by checking the envs slot registry
      // when we load here, it's env version in the aspect list already has the new version in case the env itself is being tagged
      // so we are search for the env in the registry with the new version number
      // but since the env only registered during the on load of the bit process (before the tag) it's version in the registry is only the old one
      // once we reload them we will have it registered with the new version as well
      await reloadAspectsWithNewVersion(legacyComponents);
      const components = await host.getManyByLegacy(legacyComponents);
      const { builderDataMap } = await tagFn(components, options);
      return this.builderDataMapToLegacyOnTagResults(builderDataMap);
    };
    this.legacyScope.onTag.push(legacyOnTagFunc);
    this.tagRegistry.register(tagFn);
  }

  getManyByLegacy(components: ConsumerComponent[]): Promise<Component[]> {
    return mapSeries(components, async (component) => this.getFromConsumerComponent(component));
  }

  builderDataMapToLegacyOnTagResults(builderDataComponentMap: ComponentMap<BuilderData>): LegacyOnTagResult[] {
    const builderDataToLegacyExtension = (component: Component, builderData: BuilderData) => {
      const existingBuilder = component.state.aspects.get(BuilderAspect.id)?.legacy;
      const builderExtension = existingBuilder || new ExtensionDataEntry(undefined, undefined, BuilderAspect.id);
      builderExtension.data = builderData;
      return builderExtension;
    };
    return builderDataComponentMap.toArray().map(([component, builderData]) => ({
      id: component.id._legacy,
      builderData: builderDataToLegacyExtension(component, builderData),
    }));
  }

  /**
   * register to the post-export slot.
   */
  onPostPut(postPutFn: OnPostPut) {
    this.postPutSlot.register(postPutFn);
    return this;
  }

  /**
   * register to the post-export slot.
   */
  registerOnPostExport(postExportFn: OnPostExport) {
    this.postExportSlot.register(postExportFn);
    return this;
  }

  registerOnPostObjectsPersist(postObjectsPersistFn: OnPostObjectsPersist) {
    this.postObjectsPersist.register(postObjectsPersistFn);
    return this;
  }

  registerOnPrePersistExport(prePersistFn: OnPrePersistExport) {
    this.prePersistExportSlot.register(prePersistFn);
    return this;
  }

  /**
   * Will fetch a list of components into the current scope.
   * This will only fetch the object and won't write the files to the actual FS
   *
   * @param {ComponentsIds} ids list of ids to fetch
   */
  fetch(ids: ComponentsIds) {} // eslint-disable-line @typescript-eslint/no-unused-vars

  /**
   * This function will get a component and sealed it's current state into the scope
   *
   * @param {Component[]} components A list of components to seal with specific persist options (such as message and version number)
   * @param {PersistOptions} persistGeneralOptions General persistence options such as verbose
   */
  persist(components: Component[], options: PersistOptions) {} // eslint-disable-line @typescript-eslint/no-unused-vars

  // TODO: temporary compiler workaround - discuss this with david.
  private toJs(str: string) {
    if (str.endsWith('.ts')) return str.replace('.ts', '.js');
    return str;
  }

  private parseLocalAspect(localAspects: string[]) {
    const dirPaths = localAspects.map((localAspect) => resolve(localAspect.replace('file://', '')));
    return dirPaths;
  }

  private findRuntime(dirPath: string, runtime: string) {
    const files = readdirSync(join(dirPath, 'dist'));
    return files.find((path) => path.includes(`${runtime}.runtime.js`));
  }

  private async loadAspectFromPath(localAspects: string[]) {
    const dirPaths = this.parseLocalAspect(localAspects);
    const manifests = dirPaths.map((dirPath) => {
      const scopeRuntime = this.findRuntime(dirPath, 'scope');
      if (scopeRuntime) {
        // eslint-disable-next-line global-require, import/no-dynamic-require
        const module = require(join(dirPath, 'dist', scopeRuntime));
        return module.default || module;
      }
      // eslint-disable-next-line global-require, import/no-dynamic-require
      const module = require(dirPath);
      return module.default || module;
    });

    await this.aspectLoader.loadExtensionsByManifests(manifests, true);
  }

  private localAspects: string[] = [];

  async loadAspects(ids: string[], throwOnError = false): Promise<void> {
    const notLoadedIds = ids.filter((id) => !this.aspectLoader.isAspectLoaded(id));
    if (!notLoadedIds.length) return;
    const coreAspectsStringIds = this.aspectLoader.getCoreAspectIds();
    const idsWithoutCore: string[] = difference(ids, coreAspectsStringIds);
    const aspectIds = idsWithoutCore.filter((id) => !id.startsWith('file://'));
    // TODO: use diff instead of filter twice
    const localAspects = ids.filter((id) => id.startsWith('file://'));
    this.localAspects = this.localAspects.concat(localAspects);
    // load local aspects for debugging purposes.
    await this.loadAspectFromPath(localAspects);
    const componentIds = await this.resolveMultipleComponentIds(aspectIds);
    if (!componentIds || !componentIds.length) return;
    const resolvedAspects = await this.getResolvedAspects(await this.import(componentIds));
    // Always throw an error when can't load scope extension
    await this.aspectLoader.loadRequireableExtensions(resolvedAspects, throwOnError);
  }

  private async resolveLocalAspects(ids: string[], runtime?: string) {
    const dirs = this.parseLocalAspect(ids);

    return dirs.map((dir) => {
      const runtimeManifest = runtime ? this.findRuntime(dir, runtime) : undefined;
      return new AspectDefinition(dir, runtimeManifest ? join(dir, 'dist', runtimeManifest) : null);
    });
  }

  async getResolvedAspects(components: Component[]) {
    if (!components.length) return [];
    const network = await this.isolator.isolateComponents(
      components.map((c) => c.id),
      { baseDir: this.path, skipIfExists: true, installOptions: { copyPeerToRuntimeOnRoot: true } },
      this.legacyScope
    );

    const capsules = network.seedersCapsules;

    return capsules.map((capsule) => {
      // return RequireableComponent.fromCapsule(capsule);
      return new RequireableComponent(capsule.component, () => {
        const scopeRuntime = capsule.component.state.filesystem.files.find((file) =>
          file.relative.includes('.scope.runtime.')
        );
        // eslint-disable-next-line global-require, import/no-dynamic-require
        if (scopeRuntime) return require(join(capsule.path, 'dist', this.toJs(scopeRuntime.relative)));
        // eslint-disable-next-line global-require, import/no-dynamic-require
        return require(capsule.path);
      });
    });
  }

  private async resolveUserAspects(runtimeName?: string, userAspectsIds?: ComponentID[]): Promise<AspectDefinition[]> {
    if (!userAspectsIds || !userAspectsIds.length) return [];
    const components = await this.getMany(userAspectsIds);
    const network = await this.isolator.isolateComponents(
      userAspectsIds,
      { baseDir: this.path, skipIfExists: true },
      this.legacyScope
    );
    const capsules = network.seedersCapsules;
    const aspectDefs = await this.aspectLoader.resolveAspects(components, async (component) => {
      const capsule = capsules.getCapsule(component.id);
      if (!capsule) throw new Error(`failed loading aspect: ${component.id.toString()}`);
      const localPath = capsule.path;

      return {
        aspectPath: localPath,
        runtimePath: runtimeName ? await this.aspectLoader.getRuntimePath(component, localPath, runtimeName) : null,
      };
    });
    return aspectDefs;
  }

  async resolveAspects(runtimeName?: string, componentIds?: ComponentID[]): Promise<AspectDefinition[]> {
    const userAspectsIds = componentIds || (await this.resolveMultipleComponentIds(this.aspectLoader.getUserAspects()));
    const withoutLocalAspects = userAspectsIds.filter((aspectId) => {
      return this.localAspects.includes(aspectId.fullName.replace('/', '.'));
    });
    const userAspectsDefs = await this.resolveUserAspects(runtimeName, withoutLocalAspects);
    const localResolved = await this.resolveLocalAspects(this.localAspects, runtimeName);
    const coreAspects = await this.aspectLoader.getCoreAspectDefs(runtimeName);

    const allDefs = userAspectsDefs.concat(coreAspects).concat(localResolved);
    const uniqDefs = uniqBy(allDefs, (def) => `${def.aspectPath}-${def.runtimePath}`);
    let defs = uniqDefs;
    if (runtimeName) {
      defs = defs.filter((def) => def.runtimePath);
    }

    return defs;
  }

  async getLegacyGraph(ids?: ComponentID[]): Promise<LegacyGraph> {
    if (!ids || ids.length < 1) ids = (await this.list()).map((comp) => comp.id) || [];
    const legacyIds = ids.map((id) => {
      let bitId = id._legacy;
      // The resolve bitId in scope will remove the scope name in case it's the same as the scope
      // We restore it back to use it correctly in the legacy code.
      if (!bitId.hasScope()) {
        bitId = bitId.changeScope(this.legacyScope?.name);
      }
      return bitId;
    });

    const legacyGraph = await buildOneGraphForComponentsUsingScope(legacyIds, this.legacyScope);
    return legacyGraph;
  }

  /**
   * import components into the scope.
   */
  async import(ids: ComponentID[], useCache = true) {
    const legacyIds = ids.map((id) => {
      const legacyId = id._legacy;
      if (legacyId.scope === this.name) return legacyId.changeScope(null);
      return legacyId;
    });

    const withoutOwnScopeAndLocals = legacyIds.filter((id) => {
      return id.scope !== this.name && id.hasScope();
    });
    await this.legacyScope.import(ComponentsIds.fromArray(withoutOwnScopeAndLocals), useCache);

    // TODO: return a much better output based on legacy version-dependencies
    return this.getMany(ids);
  }

  /**
   * get a component.
   * @param id component id
   */
  async get(id: ComponentID): Promise<Component | undefined> {
    const legacyId = id._legacy;
    let modelComponent = await this.legacyScope.getModelComponentIfExist(id._legacy);
    // Search with scope name for bare scopes
    if (!modelComponent && !legacyId.scope) {
      id = id.changeScope(this.name);
      modelComponent = await this.legacyScope.getModelComponentIfExist(id._legacy);
    }
    if (!modelComponent) return undefined;

    // :TODO move to head snap once we have it merged, for now using `latest`.
    const versionStr = id.version && id.version !== 'latest' ? id.version : modelComponent.latest();
    const newId = id.changeVersion(versionStr);
    const version = await modelComponent.loadVersion(versionStr, this.legacyScope.objects);
    const snap = this.createSnapFromVersion(version);
    const state = await this.createStateFromVersion(id, version);
    const tagMap = await this.getTagMap(modelComponent);

    return new Component(newId, snap, state, tagMap, this);
  }

  async getFromConsumerComponent(consumerComponent: ConsumerComponent): Promise<Component> {
    const legacyId = consumerComponent.id;
    const modelComponent = await this.legacyScope.getModelComponent(legacyId);
    // :TODO move to head snap once we have it merged, for now using `latest`.
    const id = await this.resolveComponentId(legacyId);
    const version =
      consumerComponent.pendingVersion ||
      (await modelComponent.loadVersion(legacyId.version as string, this.legacyScope.objects));
    const snap = this.createSnapFromVersion(version);
    const state = await this.createStateFromVersion(id, version);
    const tagMap = await this.getTagMap(modelComponent);

    return new Component(id, snap, state, tagMap, this);
  }

  /**
   * list all components in the scope.
   */
  async list(filter?: { offset: number; limit: number }, includeCache = false): Promise<Component[]> {
    const componentsIds = await this.listIds(includeCache);

    return this.getMany(
      filter && filter.limit ? slice(componentsIds, filter.offset, filter.offset + filter.limit) : componentsIds
    );
  }

  /**
   * get ids of all scope components.
   */
  async listIds(includeCache = false): Promise<ComponentID[]> {
    let modelComponents = await this.legacyScope.list();
    if (!includeCache) {
      modelComponents = modelComponents.filter((modelComponent) => this.exists(modelComponent));
    }

    const componentsIds = modelComponents.map((component) =>
      ComponentID.fromLegacy(component.toBitIdWithLatestVersion())
    );
    return componentsIds;
  }

  /**
   * Check if a specific id exist in the scope
   * @param componentId
   */
  async hasId(componentId: ComponentID, includeCache = false): Promise<boolean> {
    const ids = await this.listIds(includeCache);
    const found = ids.find((id) => {
      return id.isEqual(componentId);
    });
    return !!found;
  }

  /**
   * determine whether a component exists in the scope.
   */
  exists(modelComponent: ModelComponent) {
    return modelComponent.scope === this.name;
  }

  async getMany(ids: Array<ComponentID>): Promise<Component[]> {
    const idsWithoutEmpty = compact(ids);
    const componentsP = mapSeries(idsWithoutEmpty, async (id: ComponentID) => {
      return this.get(id);
    });
    const components = await componentsP;
    return compact(components);
  }

  /**
   * load components from a scope and load its aspects.
   */
  async loadMany(ids: ComponentID[]) {
    // get all components.
    const components = await this.getMany(ids);
    // load all component aspects.
    await Promise.all(
      components.map(async (component) => {
        const aspectIds = component.state.aspects.ids;
        await this.loadAspects(aspectIds, true);
      })
    );

    return components;
  }

  /**
   * get a component and throw an exception if not found.
   * @param id component id
   */
  async getOrThrow(id: ComponentID): Promise<Component> {
    const component = await this.get(id);
    if (!component) throw new ComponentNotFound(id);
    return component;
  }

  /**
   * returns a specific state of a component.
   * @param id component ID.
   * @param hash state hash.
   */
  async getState(id: ComponentID, hash: string): Promise<State> {
    const version = (await this.legacyScope.objects.load(new Ref(hash))) as Version;
    return this.createStateFromVersion(id, version);
  }

  async getSnap(id: ComponentID, hash: string): Promise<Snap> {
    // TODO: add cache by hash
    const version = (await this.legacyScope.objects.load(new Ref(hash))) as Version;
    return this.createSnapFromVersion(version);
  }

  async getLogs(id: ComponentID): Promise<ComponentLog[]> {
    return this.legacyScope.loadComponentLogs(id._legacy);
  }

  /**
   * resolve a component ID.
   * @param id component ID.
   */
  async resolveComponentId(id: string | ComponentID | BitId): Promise<ComponentID> {
    const idStr = id.toString();
    const component = await this.legacyScope.loadModelComponentByIdStr(idStr);
    const getIdToCheck = () => {
      if (component) return idStr; // component exists in the scope with the scope-name.
      if (idStr.startsWith(`${this.name}/`)) {
        // component with the full name doesn't exist in the scope, it might be locally tagged
        return idStr.replace(`${this.name}/`, '');
      }
      return idStr;
    };
    const IdToCheck = getIdToCheck();
    const legacyId = await this.legacyScope.getParsedId(IdToCheck);
    if (!legacyId.scope) return ComponentID.fromLegacy(legacyId, this.name);
    return ComponentID.fromLegacy(legacyId);
  }

  async resolveMultipleComponentIds(ids: Array<string | ComponentID | BitId>) {
    return Promise.all(ids.map(async (id) => this.resolveComponentId(id)));
  }

  async getExactVersionBySemverRange(id: ComponentID, range: string): Promise<string | null> {
    const modelComponent = await this.legacyScope.getModelComponent(id._legacy);
    const versions = modelComponent.listVersions();
    return semver.maxSatisfying<string>(versions, range);
  }

  async resumeExport(exportId: string, remotes: string[]): Promise<string[]> {
    return resumeExport(this.legacyScope, exportId, remotes);
  }

  private async getTagMap(modelComponent: ModelComponent): Promise<TagMap> {
    const tagMap = new TagMap();
    await mapSeries(Object.keys(modelComponent.versions), async (versionStr: string) => {
      const version = await modelComponent.loadVersion(versionStr, this.legacyScope.objects, false);
      // TODO: what to return if no version in objects
      if (version) {
        const snap = this.createSnapFromVersion(version);
        const tag = new Tag(snap, new SemVer(versionStr));
        tagMap.set(tag.version, tag);
      }
    });

    return tagMap;
  }

  private createSnapFromVersion(version: Version): Snap {
    return new Snap(
      version.hash().toString(),
      new Date(parseInt(version.log.date)),
      version.parents.map((p) => p.toString()),
      {
        displayName: version.log.username || 'unknown',
        email: version.log.email || 'unknown@anywhere',
      },
      version.log.message
    );
  }

  private async createStateFromVersion(id: ComponentID, version: Version): Promise<State> {
    const consumerComponent = await this.legacyScope.getConsumerComponent(id._legacy);
    const state = new State(
      // We use here the consumerComponent.extensions instead of version.extensions
      // because as part of the conversion to consumer component the artifacts are initialized as Artifact instances
      new Config(version.mainFile, consumerComponent.extensions),
      this.componentExtension.createAspectList(consumerComponent.extensions, this.name),
      ComponentFS.fromVinyls(consumerComponent.files),
      version.dependencies,
      consumerComponent
    );
    return state;
  }

  async resolveId(id: string): Promise<ComponentID> {
    const legacyId = await this.legacyScope.getParsedId(id);
    return ComponentID.fromLegacy(legacyId);
  }

  // TODO: add new API for this
  async _legacyRemotes(): Promise<Remotes> {
    return getScopeRemotes(this.legacyScope);
  }

  load() {}

  /**
   * declare the slots of scope extension.
   */
  static slots = [
    Slot.withType<OnTag>(),
    Slot.withType<OnPostPut>(),
    Slot.withType<OnPostExport>(),
    Slot.withType<OnPostObjectsPersist>(),
    Slot.withType<OnPrePersistExportSlot>(),
  ];
  static runtime = MainRuntime;

  static dependencies = [
    ComponentAspect,
    UIAspect,
    GraphqlAspect,
    CLIAspect,
    IsolatorAspect,
    AspectLoaderAspect,
    ExpressAspect,
    LoggerAspect,
  ];

  static async provider(
    [componentExt, ui, graphql, cli, isolator, aspectLoader, express, loggerMain]: [
      ComponentMain,
      UiMain,
      GraphqlMain,
      CLIMain,
      IsolatorMain,
      AspectLoaderMain,
      ExpressMain,
      LoggerMain
    ],
    config: ScopeConfig,
    [tagSlot, postPutSlot, postExportSlot, postObjectsPersistSlot, prePersistExportSlot]: [
      TagRegistry,
      OnPostPutSlot,
      OnPostExportSlot,
      OnPostObjectsPersistSlot,
      OnPrePersistExportSlot
    ],
    harmony: Harmony
  ) {
    const bitConfig: any = harmony.config.get('teambit.harmony/bit');
    const legacyScope = await loadScopeIfExist(bitConfig?.cwd);
    if (!legacyScope) {
      return undefined;
    }

    const logger = loggerMain.createLogger(ScopeAspect.id);
    const scope = new ScopeMain(
      harmony,
      legacyScope,
      componentExt,
      tagSlot,
      postPutSlot,
      postExportSlot,
      postObjectsPersistSlot,
      prePersistExportSlot,
      isolator,
      aspectLoader,
      config,
      logger
    );
    cli.registerOnStart(async (hasWorkspace: boolean) => {
      if (hasWorkspace) return;
      await scope.loadAspects(aspectLoader.getNotLoadedConfiguredExtensions());
    });
    cli.register(new ResumeExportCmd(scope), new ExportCmd());

    const onPutHook = async (ids: string[], lanes: Lane[], authData?: AuthData): Promise<void> => {
      logger.debug(`onPutHook, started. (${ids.length} components)`);
      const componentIds = await scope.resolveMultipleComponentIds(ids);
      const fns = postPutSlot.values();
      const data = {
        ids: componentIds,
        lanes,
      };
      const metadata = { auth: authData };
      await Promise.all(fns.map(async (fn) => fn(data, metadata)));
      logger.debug(`onPutHook, completed. (${ids.length} components)`);
    };

    const getAuthData = (): AuthData | undefined => {
      const token = Http.getToken();
      return token ? { type: DEFAULT_AUTH_TYPE, credentials: token } : undefined;
    };

    const onPostExportHook = async (ids: BitId[], lanes: Lane[]): Promise<void> => {
      logger.debug(`onPostExportHook, started. (${ids.length} components)`);
      const componentIds = await scope.resolveMultipleComponentIds(ids);
      const fns = postExportSlot.values();
      const data = {
        ids: componentIds,
        lanes,
      };
      const metadata = { auth: getAuthData() };
      await Promise.all(fns.map(async (fn) => fn(data, metadata)));
      logger.debug(`onPostExportHook, completed. (${ids.length} components)`);
    };

    const onPostObjectsPersistHook = async (): Promise<void> => {
      logger.debug(`onPostObjectsPersistHook, started`);
      const fns = postObjectsPersistSlot.values();
      const metadata = { auth: getAuthData() };
      await Promise.all(fns.map(async (fn) => fn(undefined, metadata)));
      logger.debug(`onPostObjectsPersistHook, completed`);
    };

    const onPrePersistExportHook = async (clientId: string, scopes: string[]): Promise<void> => {
      const data = { clientId, scopes };
      logger.debug(`onPrePersistExportHook, started`, data);
      const fns = prePersistExportSlot.values();
      const metadata = { auth: getAuthData() };
      await Promise.all(fns.map(async (fn) => fn(data, metadata)));
      logger.debug(`onPrePersistExportHook, completed`);
    };

    ExportPersist.onPutHook = onPutHook;
    PostSign.onPutHook = onPutHook;
    Scope.onPostExport = onPostExportHook;
    Scope.onPrePersistExport = onPrePersistExportHook;
    Repository.onPostObjectsPersist = onPostObjectsPersistHook;

    express.register([
      new PutRoute(scope, postPutSlot),
      new FetchRoute(scope),
      new ActionRoute(scope),
      new DeleteRoute(scope),
    ]);
    // @ts-ignore - @ran to implement the missing functions and remove it
    ui.registerUiRoot(new ScopeUIRoot(scope));
    graphql.register(scopeSchema(scope));
    componentExt.registerHost(scope);

    return scope;
  }
}

ScopeAspect.addRuntime(ScopeMain);
