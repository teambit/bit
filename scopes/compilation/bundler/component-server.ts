import { Component } from '@teambit/component';
import { ExecutionContext } from '@teambit/envs';
import { PubsubMain } from '@teambit/pubsub';

import { AddressInfo } from 'net';

import { DevServer } from './dev-server';
import { BindError } from './exceptions';
import { ComponentsServerStartedEvent } from './events';
import { BundlerAspect } from './bundler.aspect';

export class ComponentServer {
  // why is this here
  errors?: Error[];
  constructor(
    /**
     * browser runtime slot
     */
    private pubsub: PubsubMain,

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
    const server = await this.devServer.listen(this.port);
    const address = server.address();
    const hostname = this.getHostname(address);
    if (!address) throw new BindError();
    this.hostname = hostname;

    this.pubsub.pub(
      BundlerAspect.id,
      this.createComponentsServerStartedEvent(server, this.context, hostname, this.port)
    );
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

  private onChange() {}

  private createComponentsServerStartedEvent: (
    DevServer,
    ExecutionContext,
    string,
    number
  ) => ComponentsServerStartedEvent = (componentsServer, context, hostname, port) => {
    return new ComponentsServerStartedEvent(Date.now(), componentsServer, context, hostname, port);
  };

  /**
   * get the url of the component server.
   */
  get url() {
    return `/preview/${this.context.envRuntime.id}`;
  }
}
