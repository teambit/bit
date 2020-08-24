import { Component } from '@teambit/component';
import { ExecutionContext } from '@teambit/environments';
import { AddressInfo } from 'net';

import { DevServer } from './dev-server';
import { BindError } from './exceptions';

export class ComponentServer {
  constructor(
    /**
     * components contained in the existing component server.
     */
    readonly context: ExecutionContext,

    /**
     * port of the component server.
     */
    readonly port: number,

    /**
     * env dev server.
     */
    readonly devServer: DevServer
  ) {}

  hostname: string | undefined;

  /**
   * determine whether component server contains a component.
   */
  hasComponent(component: Component) {
    return this.context.components.find((contextComponent) => contextComponent.equals(component));
  }

  async listen() {
    const server = this.devServer.listen(this.port);
    const address = server.address();
    const hostname = this.getHostname(address);
    if (!address) throw new BindError();
    this.hostname = hostname;
  }

  private getHostname(address: string | AddressInfo | null) {
    if (address === null) throw new BindError();
    if (typeof address === 'string') return address;

    let hostname = address.address;
    if (hostname === '::') {
      hostname = 'localhost';
    }

    return hostname;
  }

  /**
   * get the url of the component server.
   */
  get url() {
    return `/preview/${this.context.envRuntime.id}`;
  }
}
