import { Consumer } from '../consumer';
import { Scope } from '../scope/scope.api';
import { Component, ComponentFactory } from '../component';
import ComponentsList from '../consumer/component/components-list';

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
   * provides status of all components in the workspace.
   */
  status() {}

  /**
   * list all workspace components.
   */
  async list() {
    const componentList = new ComponentsList(this.consumer);
    const consumerComponents = await componentList.getAuthoredAndImportedFromFS();
    return consumerComponents.map(consumerComponent => {
      return this.componentFactory.fromLegacyComponent(consumerComponent);
    });
  }

  /**
   * get a component from scope
   * @param id component ID
   */
  async get(id: string): Promise<Component> {
    const componentId = this.consumer.getParsedId(id);
    const legacyComponent = await this.consumer.loadComponent(componentId);
    return this.componentFactory.fromLegacyComponent(legacyComponent);
  }
}
