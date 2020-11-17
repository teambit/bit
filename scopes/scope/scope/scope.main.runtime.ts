import type { AspectLoaderMain } from '@teambit/aspect-loader';
import { readdirSync } from 'fs-extra';
import { resolve, join } from 'path';
import { AspectLoaderAspect, AspectDefinition } from '@teambit/aspect-loader';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import type { AspectList, ComponentMain, ComponentMap } from '@teambit/component';
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
import { LoggerAspect } from '@teambit/logger';
import { ExpressAspect, ExpressMain } from '@teambit/express';
import type { UiMain } from '@teambit/ui';
import { UIAspect } from '@teambit/ui';
import { RequireableComponent } from '@teambit/modules.requireable-component';
import { BitId, BitIds as ComponentsIds } from 'bit-bin/dist/bit-id';
import { ModelComponent, Version } from 'bit-bin/dist/scope/models';
import { Ref } from 'bit-bin/dist/scope/objects';
import LegacyScope, { OnTagResult, OnTagFunc, OnTagOpts } from 'bit-bin/dist/scope/scope';
import { ComponentLog } from 'bit-bin/dist/scope/models/model-component';
import { loadScopeIfExist } from 'bit-bin/dist/scope/scope-loader';
import { PersistOptions } from 'bit-bin/dist/scope/types';
import BluebirdPromise from 'bluebird';
import { ExportPersist } from 'bit-bin/dist/scope/actions';
import { getScopeRemotes } from 'bit-bin/dist/scope/scope-remotes';
import { Remotes } from 'bit-bin/dist/remotes';
import { compact, slice } from 'lodash';
import { SemVer } from 'semver';
import { ComponentNotFound } from './exceptions';
import { ExportCmd } from './export/export-cmd';
import { ScopeAspect } from './scope.aspect';
import { scopeSchema } from './scope.graphql';
import { ScopeUIRoot } from './scope.ui-root';
import { PutRoute, FetchRoute, ActionRoute, DeleteRoute } from './routes';

type TagRegistry = SlotRegistry<OnTag>;

export type OnTag = (components: Component[], options?: OnTagOpts) => Promise<ComponentMap<AspectList>>;

export type OnPostPut = (ids: ComponentID[]) => void;

export type OnPostPutSlot = SlotRegistry<OnPostPut>;

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

    /**
     * slot registry for subscribing to post-export
     */
    private postPutSlot: OnPostPutSlot,

    private isolator: IsolatorMain,

    private aspectLoader: AspectLoaderMain,

    private config: ScopeConfig
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
    const legacyOnTagFunc: OnTagFunc = async (legacyIds: BitId[], options?: OnTagOpts): Promise<OnTagResult[]> => {
      const host = this.componentExtension.getHost();
      const ids = await Promise.all(legacyIds.map((legacyId) => host.resolveComponentId(legacyId)));
      const components = await host.getMany(ids);
      // TODO: fix what legacy tag accepts to just extension name and files.
      const aspectListComponentMap = await tagFn(components, options);
      const extensionsToLegacy = (aspectList: AspectList) => {
        const extensionsDataList = aspectList.toLegacy();
        extensionsDataList.forEach((extension) => {
          if (extension.id && this.aspectLoader.isCoreAspect(extension.id.toString())) {
            extension.name = extension.id.toString();
            extension.extensionId = undefined;
          }
        });
        return extensionsDataList;
      };
      const results = aspectListComponentMap.toArray().map(([component, aspectList]) => ({
        id: component.id._legacy,
        extensions: extensionsToLegacy(aspectList),
      }));
      return results;
    };
    this.legacyScope.onTag.push(legacyOnTagFunc);
    this.tagRegistry.register(tagFn);
  }

  /**
   * register to the post-export slot.
   */
  onPostPut(postPutFn: OnPostPut) {
    this.legacyScope.onPostExport.push(postPutFn);
    this.postPutSlot.register(postPutFn);
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

  async getResolvedAspects(components: Component[]) {
    if (!components.length) return [];
    const capsules = await this.isolator.isolateComponents(
      components,
      { baseDir: this.path, skipIfExists: true, installOptions: { copyPeerToRuntimeOnRoot: true } },
      this.legacyScope
    );

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
    const localAspects = ids.filter((id) => id.startsWith('file://'));
    this.localAspects = this.localAspects.concat(localAspects);
    // load local aspects for debugging purposes.
    await this.loadAspectFromPath(localAspects);
    const aspectIds = ids.filter((id) => !id.startsWith('file://'));
    const componentIds = aspectIds.map((id) => ComponentID.fromLegacy(BitId.parse(id, true)));
    if (!componentIds || !componentIds.length) return;
    const resolvedAspects = await this.getResolvedAspects(await this.import(componentIds));
    // Always throw an error when can't load scope extension
    await this.aspectLoader.loadRequireableExtensions(resolvedAspects, throwOnError);
  }

  private async resolveLocalAspects(ids: string[], runtime: string) {
    const dirs = this.parseLocalAspect(ids);

    return dirs.map((dir) => {
      const runtimeManifest = this.findRuntime(dir, runtime);
      return new AspectDefinition(dir, runtimeManifest ? join(dir, 'dist', runtimeManifest) : null);
    });
  }

  async resolveAspects(runtimeName: string) {
    const userAspectsIds = this.aspectLoader.getUserAspects();
    const withoutLocalAspects = userAspectsIds.filter((aspectId) => {
      const id = ComponentID.fromString(aspectId);
      return this.localAspects.includes(id.fullName.replace('/', '.'));
    });
    const componentIds = await Promise.all(withoutLocalAspects.map((id) => ComponentID.fromString(id)));
    const components = await this.getMany(componentIds);
    const capsules = await this.isolator.isolateComponents(
      components,
      { baseDir: this.path, skipIfExists: true },
      this.legacyScope
    );
    const aspectDefs = await this.aspectLoader.resolveAspects(components, async (component) => {
      const capsule = capsules.getCapsule(component.id);
      if (!capsule) throw new Error(`failed loading aspect: ${component.id.toString()}`);
      const localPath = capsule.path;

      return {
        aspectPath: localPath,
        runtimesPath: await this.aspectLoader.getRuntimePath(component, localPath, runtimeName),
      };
    });

    const localResolved = await this.resolveLocalAspects(this.localAspects, runtimeName);
    const coreAspects = await this.aspectLoader.getCoreAspectDefs(runtimeName);

    return aspectDefs.concat(coreAspects).concat(localResolved);
  }

  /**
   * import components into the scope.
   */
  async import(ids: ComponentID[]) {
    const legacyIds = ids.map((id) => {
      const legacyId = id._legacy;
      if (legacyId.scope === this.name) return legacyId.changeScope(null);
      return legacyId;
    });

    const withoutOwnScope = legacyIds.filter((id) => {
      return id.scope !== this.name;
    });

    await this.legacyScope.import(ComponentsIds.fromArray(withoutOwnScope));

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

  /**
   * list all components in the scope.
   */
  async list(filter?: { offset: number; limit: number }, includeCache = false): Promise<Component[]> {
    let modelComponents = await this.legacyScope.list();
    if (!includeCache) {
      modelComponents = modelComponents.filter((modelComponent) => this.exists(modelComponent));
    }

    const componentsIds = modelComponents.map((component) =>
      ComponentID.fromLegacy(component.toBitIdWithLatestVersion())
    );

    return this.getMany(
      filter && filter.limit ? slice(componentsIds, filter.offset, filter.offset + filter.limit) : componentsIds
    );
  }

  /**
   * determine whether a component exists in the scope.
   */
  exists(modelComponent: ModelComponent) {
    return modelComponent.scope === this.name;
  }

  async getMany(ids: Array<ComponentID>): Promise<Component[]> {
    const idsWithoutEmpty = compact(ids);
    const componentsP = BluebirdPromise.mapSeries(idsWithoutEmpty, async (id: ComponentID) => {
      return this.get(id);
    });
    const components = await componentsP;
    return compact(components);
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

  async getLogs(id: ComponentID): Promise<ComponentLog[]> {
    return this.legacyScope.loadComponentLogs(id._legacy);
  }

  /**
   * resolve a component ID.
   * @param id component ID.
   */
  async resolveComponentId(id: string | ComponentID | BitId): Promise<ComponentID> {
    if (id.toString().startsWith(this.name)) {
      const withoutOwn = id.toString().replace(`${this.name}/`, '');
      const legacyId = await this.legacyScope.getParsedId(withoutOwn);
      if (!legacyId.scope) return ComponentID.fromLegacy(legacyId, this.name);
      return ComponentID.fromLegacy(legacyId);
    }

    const legacyId = await this.legacyScope.getParsedId(id.toString());
    if (!legacyId.scope) return ComponentID.fromLegacy(legacyId, this.name);
    return ComponentID.fromLegacy(legacyId);
  }

  async resolveMultipleComponentIds(ids: Array<string | ComponentID | BitId>) {
    return Promise.all(ids.map(async (id) => this.resolveComponentId(id)));
  }

  private async getTagMap(modelComponent: ModelComponent): Promise<TagMap> {
    const tagMap = new TagMap();
    await BluebirdPromise.mapSeries(Object.keys(modelComponent.versions), async (versionStr: string) => {
      const version = await modelComponent.loadVersion(versionStr, this.legacyScope.objects);
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
      [],
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

  /**
   * declare the slots of scope extension.
   */
  static slots = [Slot.withType<OnTag>(), Slot.withType<OnPostPut>()];
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
    [componentExt, ui, graphql, cli, isolator, aspectLoader, express]: [
      ComponentMain,
      UiMain,
      GraphqlMain,
      CLIMain,
      IsolatorMain,
      AspectLoaderMain,
      ExpressMain
    ],
    config: ScopeConfig,
    [tagSlot, postPutSlot]: [TagRegistry, OnPostPutSlot],
    harmony: Harmony
  ) {
    cli.register(new ExportCmd());
    const legacyScope = await loadScopeIfExist();
    if (!legacyScope) {
      return undefined;
    }

    // const logger = loggerMain.createLogger(ScopeAspect.id);
    const scope = new ScopeMain(
      harmony,
      legacyScope,
      componentExt,
      tagSlot,
      postPutSlot,
      isolator,
      aspectLoader,
      config
    );
    cli.registerOnStart(async (hasWorkspace: boolean) => {
      if (hasWorkspace) return;
      await scope.loadAspects(aspectLoader.getNotLoadedConfiguredExtensions());
    });

    ExportPersist.onPutHook = (ids: string[]) => {
      const fns = postPutSlot.values();
      fns.map(async (fn) => {
        return fn(await Promise.all(ids.map((id) => scope.resolveComponentId(id))));
      });
    };

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
