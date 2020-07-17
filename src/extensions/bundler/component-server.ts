import { Component } from '../component';
import { EnvRuntime } from '../environments';

export class ComponentServer {
  constructor(
    /**
     * components contained in the existing component server.
     */
    readonly components: Component[],

    /**
     * port of the component server.
     */
    readonly port: number,

    /**
     * hostname of the component server.
     */
    readonly hostname: string,

    /**
     * component environment.
     */
    readonly env: EnvRuntime
  ) {}

  /**
   * determine whether component server contains a component.
   */
  hasComponent(component: Component) {
    return this.components.find((contextComponent) => contextComponent.equals(component));
  }

  /**
   * get the url of the component server.
   */
  get url() {
    const protocol = this.port === 443 ? 'https://' : 'http://';
    return `${protocol}${this.hostname}:${this.port}`;
  }
}
