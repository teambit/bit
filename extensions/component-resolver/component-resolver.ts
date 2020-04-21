import { Workspace } from '@bit/bit.core.workspace';
import { Scope } from '@bit/bit.core.scope';
import { BitId as ComponentId } from '../../bit-id';
import { Component } from '@bit/bit.core.component';

/**
 * A facade to resolve a component from the correct host
 *
 * @export
 * @class ComponentResolver
 */
export default class ComponentResolver {
  constructor(
    /**
     * Scope
     */
    readonly scope: Scope,

    /**
     * Workspace
     */
    readonly workspace: Workspace | undefined
  ) {}

  /**
   * Get the actual host (workspace or scope)
   *
   * @readonly
   * @memberof ComponentResolver
   */
  get host() {
    if (this.workspace) {
      return this.workspace;
    }
    return this.scope;
  }

  async getComponent(id: ComponentId): Promise<Component | undefined> {
    if (!id) {
      return undefined;
    }
    // TODO: implement
    return undefined;
  }
}
