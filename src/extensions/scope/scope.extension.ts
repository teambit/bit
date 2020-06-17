import { Slot, SlotRegistry } from '@teambit/harmony';
import LegacyScope from '../../scope/scope';
import { PersistOptions } from '../../scope/types';
import { BitIds as ComponentsIds, BitId } from '../../bit-id';
import { Component, ComponentID } from '../component';
import { loadScopeIfExist } from '../../scope/scope-loader';

type TagRegistry = SlotRegistry<OnTag>;

export type OnTag = (ids: BitId[]) => Promise<any>;

export class ScopeExtension {
  static id = '@teambit/scope';

  constructor(
    /**
     * legacy scope
     */
    readonly legacyScope: LegacyScope,

    /**
     * slot registry for subscribing to build
     */
    private tagRegistry: TagRegistry
  ) {}

  /**
   * register to the tag slot.
   */
  onTag(tagFn: OnTag) {
    this.legacyScope.onTag.push(tagFn);
    this.tagRegistry.register(tagFn);
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
  async get(id: string | ComponentID): Promise<Component | undefined> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const componentId = typeof id === 'string' ? ComponentID.fromString(id) : id;
    return undefined;
  }

  /**
   * declare the slots of scope extension.
   */
  static slots = [Slot.withType<OnTag>()];

  static async provider(deps, config, [tagSlot]: [TagRegistry]) {
    const legacyScope = await loadScopeIfExist();
    if (!legacyScope) {
      return undefined;
    }

    return new ScopeExtension(legacyScope, tagSlot);
  }
}
