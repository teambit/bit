import { Consumer } from '../consumer';
import { Scope } from '../scope/scope.api';

import { Component, ComponentFactory, ComponentID } from '../component';

/**
 * API of the Bit Workspace
 */
export default class Workspace {
  constructor(
    /**
     * private access to the legacy consumer instance.
     */
    private consumer: Consumer,

    /**
     * access to the Workspace's `Scope` instance
     */
    readonly scope: Scope,

    /**
     * access to the `ComponentProvider` instance
     */
    private componentFactory: ComponentFactory
  ) {}

  /**
   * Workspace's configuration
   */
  get config() {
    return this.consumer.config;
  }

  /**
   * root path of the Workspace.
   */
  get path() {
    return this.consumer.getPath();
  }

  /**
   * list all components in the workspace
   */
  list() {}

  /**
   * provides status of all components in the workspace.
   */
  status() {}

  /**
   * get a component from scope
   * @param id
   */
  async get(id: string): Promise<Component> {
    const componentId = this.consumer.getParsedId(id);
    const legacyComponent = await this.consumer.loadComponent(componentId);
    return this.componentFactory.fromLegacyComponent(legacyComponent);
  }
}
