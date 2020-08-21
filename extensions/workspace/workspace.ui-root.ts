import { UIRoot } from '@teambit/ui';
import { Component, ComponentID } from '@teambit/component';
import { Workspace } from '.';
import { PathOsBased } from 'bit-bin/dist/utils/path';
import { GetBitMapComponentOptions } from 'bit-bin/dist/consumer/bit-map/bit-map';
import { BundlerMain } from '@teambit/bundler';
import { PostStartOptions, ProxyEntry } from '@teambit/ui/ui-root';
import { ComponentServer } from '@teambit/bundler/component-server';
import { flatten } from 'bit-bin/dist/utils';

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

  name = 'workspace';

  get path() {
    return this.workspace.path;
  }

  get extensionsPaths() {
    // TODO: @gilad please make sure to automate this for all extensions configured in the workspace.
    return [
      // require.resolve('./workspace.ui.runtime'),
      // require.resolve('../tester/tester.ui.runtime'),
      // require.resolve('../changelog/changelog.ui.runtime'),
      // require.resolve('@teambit/component/component.ui.runtime'),
      // require.resolve('../compositions/compositions.ui.runtime'),
      // require.resolve('../docs/docs.ui.runtime'),
      // require.resolve('../graphql/graphql.ui.runtime'),
      // require.resolve('../react-router/react-router.ui.runtime'),
      // require.resolve('../notifications/notification.ui.runtime'),
    ];
  }

  get aspectPaths() {
    return [
      // require.resolve('./workspace.aspect'),
      // require.resolve('../tester/tester.aspect'),
      // require.resolve('../changelog/changelog.aspect'),
      // require.resolve('@teambit/component/component.aspect'),
      // require.resolve('../compositions/compositions.aspect'),
      // require.resolve('../docs/docs.aspect'),
      // require.resolve('../graphql/graphql.aspect'),
      // require.resolve('../react-router/react-router.aspect'),
      // require.resolve('../notifications/notifications.aspect'),
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
