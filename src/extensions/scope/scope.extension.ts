import { Slot, SlotRegistry } from '@teambit/harmony';
import LegacyScope from '../../scope/scope';
import { PersistOptions } from '../../scope/types';
import { BitIds as ComponentsIds, BitId } from '../../bit-id';
import { Component, ComponentID, ComponentFactoryExt, ComponentFactory } from '../component';
import { loadScopeIfExist } from '../../scope/scope-loader';

type TagRegistry = SlotRegistry<OnTag>;
type PostExportRegistry = SlotRegistry<OnPostExport>;

export type OnTag = (ids: BitId[]) => Promise<any>;
export type OnPostExport = (ids: BitId[]) => Promise<any>;

export class ScopeExtension {
  static id = '@teambit/scope';
  static dependencies = [ComponentFactoryExt];

  constructor(
    /**
     * legacy scope
     */
    readonly legacyScope: LegacyScope,

    readonly componentFactory: ComponentFactory,

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

  /**
   * get a component from scope
   * @param id component ID
   */
  async get(id: string | BitId | ComponentID): Promise<Component | undefined> {
    const componentId = getBitId(id);
    // TODO: local scope should support getting a scope name
    componentId.changeScope(undefined);
    if (!componentId) return undefined;
    const legacyComponent = await this.legacyScope.getConsumerComponent(componentId);
    const component = this.componentFactory.fromLegacyComponent(legacyComponent);
    return component;
  }

  async getIfExist(id: string | BitId | ComponentID): Promise<Component | undefined> {
    const componentId = getBitId(id);
    // TODO: local scope should support getting a scope name
    componentId.changeScope(undefined);
    if (!componentId) return undefined;
    const legacyComponent = await this.legacyScope.getConsumerComponentIfExist(componentId);
    if (!legacyComponent) return undefined;
    const component = this.componentFactory.fromLegacyComponent(legacyComponent);
    return component;
  }

  getConsumerComponentIfExist;

  /**
   * declare the slots of scope extension.
   */
  static slots = [Slot.withType<OnTag>(), Slot.withType<OnPostExport>()];

  static async provider([componentFactory], config, [tagSlot, postExportSlot]: [TagRegistry, PostExportRegistry]) {
    const legacyScope = await loadScopeIfExist();
    if (!legacyScope) {
      return undefined;
    }

    return new ScopeExtension(legacyScope, componentFactory, tagSlot, postExportSlot);
  }
}

// TODO: handle this properly when we decide about using bitId vs componentId
// if it's still needed we should move it other place, it will be used by many places
function getBitId(id): BitId {
  if (id instanceof ComponentID) return id._legacy;
  if (typeof id === 'string') return BitId.parse(id, true);
  return id;
}
