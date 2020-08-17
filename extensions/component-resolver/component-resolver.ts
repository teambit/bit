import { Workspace } from '@teambit/workspace';
import { ScopeExtension } from '@teambit/scope';
import { BitId as ComponentId } from 'bit-bin/dist/bit-id';
import { Component } from '@teambit/component';

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
    readonly scope: ScopeExtension,

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
