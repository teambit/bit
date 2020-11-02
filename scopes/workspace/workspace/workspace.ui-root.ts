import { BundlerMain, ComponentServer } from '@teambit/bundler';
import { Component, ComponentID } from '@teambit/component';
import { UIRoot, PostStartOptions, ProxyEntry } from '@teambit/ui';
import { GetBitMapComponentOptions } from 'bit-bin/dist/consumer/bit-map/bit-map';
import { flatten } from 'bit-bin/dist/utils';
import { PathOsBased } from 'bit-bin/dist/utils/path';

import { Workspace } from './workspace';

export class WorkspaceUIRoot implements UIRoot {
  constructor(
    /**
     * workspace extension.
     */
    private workspace: Workspace,

    /**
     * bundler extension
     */
    private bundler: BundlerMain
  ) {}

  priority = true;

  get name() {
    return this.workspace.name;
  }

  get path() {
    return this.workspace.path;
  }

  get configFile() {
    return 'workspace.json';
  }

  get devServers() {
    return this.getServers();
  }

  async resolveAspects(runtimeName: string) {
    return this.workspace.resolveAspects(runtimeName);
  }

  // TODO: @gilad please implement with variants.
  resolvePattern(pattern: string): Promise<Component[]> {
    return this.workspace.byPattern(pattern);
  }

  getConfig() {
    return {};
  }

  /**
   * proxy to `workspace.componentDir()`
   */
  componentDir(
    componentId: ComponentID,
    bitMapOptions?: GetBitMapComponentOptions,
    options = { relative: false }
  ): PathOsBased {
    return this.workspace.componentDir(componentId, bitMapOptions, options);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async postStart(options?: PostStartOptions) {
    const devServers = await this.getServers();
    devServers.forEach((server) => server.listen());
    // DON'T add wait! this promise never resolve so it's stop all the start process!
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.workspace.watcher.watchAll();
  }

  private _serversPromise: Promise<ComponentServer[]>;

  private async getServers(): Promise<ComponentServer[]> {
    if (this._serversPromise) return this._serversPromise;
    this._serversPromise = this.bundler.devServer(await this.workspace.byPattern(''), this);
    return this._serversPromise;
  }

  async getProxy(): Promise<ProxyEntry[]> {
    const servers = await this.getServers();

    const proxyConfigs = servers.map((server) => {
      return [
        {
          context: [`/preview/${server.context.envRuntime.id}`],
          target: `http://localhost:${server.port}`,
        },
        {
          context: [`/_hmr/${server.context.envRuntime.id}`],
          target: `http://localhost:${server.port}`,
          ws: true,
        },
      ];
    });

    return flatten(proxyConfigs);
  }
}
