import type { Component } from '@teambit/component';
import type { ExecutionContext } from '@teambit/envs';
import type { PubsubMain } from '@teambit/pubsub';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import type { DevServer } from './dev-server';
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
  ) {}

  hostname: string | undefined;
  private _server?: Server;
  private _isRestarting: boolean = false;

  get server() {
    return this._server;
  }

  get envId() {
    return this.context.envRuntime.id;
  }
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

  async listen(specificPort?: number) {
    const port = specificPort || (await selectPort(this.portRange));
    this._port = port;
    this._server = await this.devServer.listen(port);
    const address = this._server.address();
    const hostname = this.getHostname(address);
    if (!address) throw new BindError();
    this.hostname = hostname;

    this.pubsub.pub(BundlerAspect.id, this.createComponentsServerStartedEvent(this, this.context, hostname, port));
  }

  async close(): Promise<void> {
    if (!this.server) return;

    return new Promise<void>((resolve, reject) => {
      this.server?.close((err) => {
        if (err) {
          reject(err);
        } else {
          this._server = undefined;
          this.hostname = undefined;
          resolve();
        }
      });
    });
  }

  async restart(useNewPort = false): Promise<void> {
    if (this._isRestarting) {
      // add a logger here once we start using this API
      return;
    }
    this._isRestarting = true;
    try {
      await this.close();
      await this.listen(useNewPort ? undefined : this._port);
    } catch (error) {
      if (!this.errors) this.errors = [];
      this.errors.push(error as Error);
    } finally {
      this._isRestarting = false;
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

  private onChange() {}

  private createComponentsServerStartedEvent: (
    componentsServer,
    context,
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
