import { SemVer } from 'semver';
import { Slot, SlotRegistry } from '@teambit/harmony';
import LegacyScope from '../../scope/scope';
import { PersistOptions } from '../../scope/types';
import { BitIds as ComponentsIds, BitId } from '../../bit-id';
import {
  Component,
  ComponentID,
  ComponentExtension,
  ComponentFactory,
  State,
  Snap,
  ComponentFS,
  Tag,
  TagMap,
} from '../component';
import { loadScopeIfExist } from '../../scope/scope-loader';
import { Version, ModelComponent } from '../../scope/models';
import Config from '../component/config';
import { Ref } from '../../scope/objects';
import { ExtensionDataList } from '../../consumer/config';
import { ComponentNotFound } from './exceptions';
import { UIExtension } from '../ui';
import { ScopeUIRoot } from './scope.ui-root';
import { GraphQLExtension } from '../graphql';
import { scopeSchema } from './scope.graphql';
import { ComponentMeta } from '../component/component-meta';

type TagRegistry = SlotRegistry<OnTag>;
type PostExportRegistry = SlotRegistry<OnPostExport>;

export type OnTag = (ids: BitId[]) => Promise<any>;
export type OnPostExport = (ids: BitId[]) => Promise<any>;

export class ScopeExtension implements ComponentFactory {
  static id = '@teambit/scope';

  constructor(
    /**
     * legacy scope
     */
    readonly legacyScope: LegacyScope,

    /**
     * component extension.
     */
    readonly componentExtension: ComponentExtension,

    /**
     * slot registry for subscribing to build
     */
    private tagRegistry: TagRegistry,

    /**
     * slot registry for subscribing to post-export
     */
    private postExportRegistry: PostExportRegistry
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async loadExtensions(extensions: ExtensionDataList): Promise<void> {
    // TODO: implement
  }

  /**
   * get a component.
   * @param id component id
   */
  async get(id: ComponentID): Promise<Component | undefined> {
    const modelComponent = await this.legacyScope.getModelComponentIfExist(id._legacy);
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
  async list(): Promise<ComponentMeta[]> {
    const modelComponents = await this.legacyScope.list();
    return modelComponents.map((component) => this.buildMetaComponent(component));
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

  private buildMetaComponent(component: ModelComponent): ComponentMeta {
    const id = component.toBitId().serialize();
    return ComponentMeta.from({
      id,
    });
  }

  private async getTagMap(modelComponent: ModelComponent): Promise<TagMap> {
    const tagMap = new TagMap();

    await Promise.all(
      Object.keys(modelComponent.versions).map(async (versionStr: string) => {
        const version = await modelComponent.loadVersion(versionStr, this.legacyScope.objects);
        const snap = this.createSnapFromVersion(version);
        const tag = new Tag(snap, new SemVer(versionStr));

        tagMap.set(tag.version, tag);
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
      this.legacyScope.getConsumerComponent(id._legacy)
    );
    return state;
  }

  /**
   * declare the slots of scope extension.
   */
  static slots = [Slot.withType<OnTag>(), Slot.withType<OnPostExport>()];

  static dependencies = [ComponentExtension, UIExtension, GraphQLExtension];

  static async provider(
    [componentExt, ui, graphql]: [ComponentExtension, UIExtension, GraphQLExtension],
    config,
    [tagSlot, postExportSlot]: [TagRegistry, PostExportRegistry]
  ) {
    const legacyScope = await loadScopeIfExist();
    if (!legacyScope) {
      return undefined;
    }

    const scope = new ScopeExtension(legacyScope, componentExt, tagSlot, postExportSlot);
    ui.registerUiRoot(new ScopeUIRoot(scope));
    graphql.register(scopeSchema(scope));
    componentExt.registerHost(scope);

    return scope;
  }
}
