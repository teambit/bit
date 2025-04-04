import { Component } from '@teambit/component';
import { ExecutionContext } from '@teambit/envs';
import { PubsubMain } from '@teambit/pubsub';
import { AddressInfo } from 'net';
import { Server } from 'http';
import { DevServer } from './dev-server';
import { BindError } from './exceptions';
import { ComponentsServerStartedEvent } from './events';
import { BundlerAspect } from './bundler.aspect';
import { selectPort } from './select-port';

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
     * port range of the component server.
     */
    readonly portRange: number[],

    /**
     * env dev server.
     */
    readonly devServer: DevServer
  ) { }

  hostname: string | undefined;
  private server?: Server;
  get envId() {
    return this.context.envRuntime.id;
  };
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
    this.server = await this.devServer.listen(port);
    const address = this.server.address();
    const hostname = this.getHostname(address);
    if (!address) throw new BindError();
    this.hostname = hostname;
    this.pubsub.pub(
      BundlerAspect.id,
      this.createComponentsServerStartedEvent(this.server, this.context, hostname, port)
    );
  }

  /**
   * Restart the server
   * Closes the existing server if it exists and starts a new one
   * @param useNewPort - Whether to select a new port (default: false)
   * @returns Promise that resolves when the server has been restarted
   */
  async restart(useNewPort: boolean = false): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve, reject) => {
        this.server?.close((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
      this.server = undefined;
    }

    if (useNewPort) {
      await this.listen();
    } else {
      try {
        this.server = await this.devServer.listen(this._port);
        const address = this.server.address();
        const hostname = this.getHostname(address);
        if (!address) throw new BindError();
        this.hostname = hostname;
        this.pubsub.pub(
          BundlerAspect.id,
          this.createComponentsServerStartedEvent(this.server, this.context, hostname, this._port)
        );
      } catch (error) {
        if (!this.errors) this.errors = [];
        this.errors.push(error as Error);
        await this.listen();
      }
    }
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

  private onChange() { }

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
    // tailing `/` is required!
    return `/preview/${this.context.envRuntime.id}/`;
  }
}
