import { Consumer } from '../consumer';
import { Scope } from '../scope';
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
    readonly scope: Scope = consumer.scope,

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
   * get a component from scope
   * @param id
   */
  async get(id: ComponentID): Promise<Component> {
    const legacyComponent = await this.consumer.loadComponent(id);
    return this.componentFactory.fromLegacyComponent(legacyComponent);
  }
}
