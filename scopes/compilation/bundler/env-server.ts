import { Component } from '@teambit/component';
import { ExecutionContext } from '@teambit/envs';
import { PubsubMain } from '@teambit/pubsub';

import { AddressInfo } from 'net';

import { DevServer } from './dev-server';
import { BindError } from './exceptions';
import { EnvsServerStartedEvent } from './events';
import { BundlerAspect } from './bundler.aspect';
import { selectPort } from './select-port';

export class EnvServer {
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
     * port range of the component server.
     */
    readonly portRange: number[],

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

  get port() {
    return this._port;
  }

  _port: number;
  async listen() {
    const port = await selectPort(this.portRange);
    this._port = port;
    const server = await this.devServer.listen(port);
    const address = server.address();
    const hostname = this.getHostname(address);
    if (!address) throw new BindError();
    this.hostname = hostname;

    this.pubsub.pub(BundlerAspect.id, this.cresateEnvServerStartedEvent(server, this.context, hostname, port));
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

  private cresateEnvServerStartedEvent: (DevServer, ExecutionContext, string, number) => EnvsServerStartedEvent = (
    envServer,
    context,
    hostname,
    port
  ) => {
    return new EnvsServerStartedEvent(Date.now(), envServer, context, hostname, port);
  };

  /**
   * get the url of the component server.
   */
  get url() {
    return `/preview/${this.context.envRuntime.id}`;
  }
}
