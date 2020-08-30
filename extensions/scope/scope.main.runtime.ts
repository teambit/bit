import type { AspectLoaderMain } from '@teambit/aspect-loader';
import { AspectLoaderAspect } from '@teambit/aspect-loader';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import type { ComponentMain } from '@teambit/component';
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
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import type { UiMain } from '@teambit/ui';
import { UIAspect } from '@teambit/ui';
import { RequireableComponent } from '@teambit/utils.requireable-component';
import { BitId, BitIds as ComponentsIds } from 'bit-bin/dist/bit-id';
import { ModelComponent, Version } from 'bit-bin/dist/scope/models';
import { Ref } from 'bit-bin/dist/scope/objects';
import LegacyScope from 'bit-bin/dist/scope/scope';
import { loadScopeIfExist } from 'bit-bin/dist/scope/scope-loader';
import { PersistOptions } from 'bit-bin/dist/scope/types';
import BluebirdPromise from 'bluebird';
import { compact, slice } from 'lodash';
import { SemVer } from 'semver';

import { ComponentNotFound } from './exceptions';
import { ExportCmd } from './export/export-cmd';
import { ScopeAspect } from './scope.aspect';
import { scopeSchema } from './scope.graphql';
import { ScopeUIRoot } from './scope.ui-root';

type TagRegistry = SlotRegistry<OnTag>;
type PostExportRegistry = SlotRegistry<OnPostExport>;

export type OnTag = (ids: BitId[]) => Promise<any>;
export type OnPostExport = (ids: BitId[]) => Promise<any>;

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
    private postExportRegistry: PostExportRegistry,

    private isolator: IsolatorMain,

    private aspectLoader: AspectLoaderMain,

    private logger: Logger
  ) {}

  /**
   * name of the scope
   */
  get name(): string {
    return this.legacyScope.name;
  }

  get path(): string {
    return this.legacyScope.path;
  }

  /**
   * register to the tag slot.
   */
  onTag(tagFn: OnTag) {
    this.legacyScope.onTag.push(tagFn);
    this.tagRegistry.register(tagFn);
  }

  /**
   * register to the post-export slot.
   */
  onPostExport(postExportFn: OnPostExport) {
    this.legacyScope.onPostExport.push(postExportFn);
    this.postExportRegistry.register(postExportFn);
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

  async loadAspects(ids: string[], throwOnError = false): Promise<void> {
    const componentIds = ids.map((id) => ComponentID.fromLegacy(BitId.parse(id, true)));
    if (!componentIds || !componentIds.length) return;
    const capsules = await this.isolator.isolateComponents(await this.getMany(componentIds), { baseDir: this.path });

    const requireableExtensions: RequireableComponent[] = await capsules.map(({ capsule }) => {
      return RequireableComponent.fromCapsule(capsule);
    });
    // Always throw an error when can't load scope extension
    await this.aspectLoader.loadRequireableExtensions(requireableExtensions, throwOnError);
  }

  /**
   * get a component.
   * @param id component id
   */
  async get(id: ComponentID): Promise<Component | undefined> {
    let modelComponent = await this.legacyScope.getModelComponentIfExist(id._legacy);
    // Search with scope name for bare scopes
    if (!modelComponent && !id.scope) {
      id = id.changeScope(this.name);
      modelComponent = await this.legacyScope.getModelComponentIfExist(id._legacy);
    }
    if (!modelComponent) return undefined;

    // :TODO move to head snap once we have it merged, for now using `latest`.
    const latest = modelComponent.latest();
    const version = await modelComponent.loadVersion(latest, this.legacyScope.objects);
    const snap = this.createSnapFromVersion(version);

    return new Component(
      id,
      snap,
      await this.createStateFromVersion(id, version),
      await this.getTagMap(modelComponent),
      this
    );
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

  /**
   * resolve a component ID.
   * @param id component ID
   */
  async resolveComponentId(id: string | ComponentID | BitId): Promise<ComponentID> {
    const legacyId = await this.legacyScope.getParsedId(id.toString());
    return ComponentID.fromLegacy(legacyId);
  }

  private async getTagMap(modelComponent: ModelComponent): Promise<TagMap> {
    const tagMap = new TagMap();

    await Promise.all(
      Object.keys(modelComponent.versions).map(async (versionStr: string) => {
        const version = await modelComponent.loadVersion(versionStr, this.legacyScope.objects);
        // TODO: what to return if no version in objects
        if (version) {
          const snap = this.createSnapFromVersion(version);
          const tag = new Tag(snap, new SemVer(versionStr));

          tagMap.set(tag.version, tag);
        }
      })
    );

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
      ComponentFS.fromVinyls(consumerComponent.files),
      version.dependencies,
      consumerComponent
    );
    return state;
  }

  /**
   * declare the slots of scope extension.
   */
  static slots = [Slot.withType<OnTag>(), Slot.withType<OnPostExport>()];
  static runtime = MainRuntime;

  static dependencies = [
    ComponentAspect,
    UIAspect,
    GraphqlAspect,
    CLIAspect,
    IsolatorAspect,
    AspectLoaderAspect,
    LoggerAspect,
  ];

  static async provider(
    [componentExt, ui, graphql, cli, isolator, aspectLoader, loggerMain]: [
      ComponentMain,
      UiMain,
      GraphqlMain,
      CLIMain,
      IsolatorMain,
      AspectLoaderMain,
      LoggerMain
    ],
    config,
    [tagSlot, postExportSlot]: [TagRegistry, PostExportRegistry],
    harmony: Harmony
  ) {
    cli.register(new ExportCmd());
    const legacyScope = await loadScopeIfExist();
    if (!legacyScope) {
      return undefined;
    }

    const logger = loggerMain.createLogger(ScopeAspect.id);
    const scope = new ScopeMain(
      harmony,
      legacyScope,
      componentExt,
      tagSlot,
      postExportSlot,
      isolator,
      aspectLoader,
      logger
    );
    if (scope.legacyScope.isBare) {
      await scope.loadAspects(aspectLoader.getNotLoadedConfiguredExtensions());
    }

    // @ts-ignore - @ran to implement the missing functions and remove it
    ui.registerUiRoot(new ScopeUIRoot(scope));
    graphql.register(scopeSchema());
    componentExt.registerHost(scope);

    return scope;
  }
}

ScopeAspect.addRuntime(ScopeMain);
