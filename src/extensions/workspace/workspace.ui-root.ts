import { UIRoot } from '../ui';
import { Component, ComponentID } from '../component';
import { Workspace } from '.';
import { PathOsBased } from '../../utils/path';
import { GetBitMapComponentOptions } from '../../consumer/bit-map/bit-map';
import { BundlerExtension } from '../bundler';
import { PostStartOptions, ProxyEntry } from '../ui/ui-root';
import { ComponentServer } from '../bundler/component-server';
import { flatten } from '../../utils';

export class WorkspaceUIRoot implements UIRoot {
  constructor(
    /**
     * workspace extension.
     */
    private workspace: Workspace,

    /**
     * bundler extension
     */
    private bundler: BundlerExtension
  ) {}

  priority = true;

  name = 'workspace';

  get path() {
    return this.workspace.path;
  }

  get extensionsPaths() {
    // TODO: @gilad please make sure to automate this for all extensions configured in the workspace.
    return [
      require.resolve('./workspace.ui'),
      require.resolve('../tester/tester.ui'),
      require.resolve('../changelog/changelog.ui'),
      require.resolve('../component/component.ui'),
      require.resolve('../compositions/compositions.ui'),
      require.resolve('../docs/docs.ui'),
      require.resolve('../notifications/notification.ui'),
    ];
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
    await this.workspace.watcher.watchAll();
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
          target: `ws://localhost:${server.port}`,
          ws: true,
        },
      ];
    });

    return flatten(proxyConfigs);
  }
}
