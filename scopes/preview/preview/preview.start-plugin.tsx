import React from 'react';
import { flatten } from 'lodash';
import { PreviewServerStatus } from '@teambit/cli.preview-server-status';
import { BundlerMain, ComponentServer } from '@teambit/bundler';
import { PubsubMain } from '@teambit/pubsub';
import { StartPlugin, StartPluginOptions, UiMain } from '@teambit/ui';
import { Workspace } from '@teambit/workspace';

export class PreviewStartPlugin implements StartPlugin {
  constructor(
    private workspace: Workspace,
    private bundler: BundlerMain,
    private ui: UiMain,
    private pubsub: PubsubMain
  ) {}

  previewServers: ComponentServer[] = [];

  async initiate(options: StartPluginOptions) {
    const [, uiRoot] = this.ui.getUi();
    const components = await this.workspace.byPattern(options.pattern || '');
    // TODO: logic for creating preview servers must be refactored to this aspect from the DevServer aspect.
    const previewServers = await this.bundler.devServer(components, uiRoot);
    previewServers.forEach((server) => server.listen());
    // DON'T add wait! this promise never resolve so it's stop all the start process!
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.workspace.watcher.watchAll({
      msgs: {
        onAll: () => {},
        onStart: () => {},
        onReady: () => {},
        onChange: () => {},
        onAdd: () => {},
        onError: () => {},
      },
    });
    this.previewServers = this.previewServers.concat(previewServers);
  }

  getProxy() {
    const proxyConfigs = this.previewServers.map((server) => {
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

  render() {
    const previewServers = this.previewServers;
    const pubsub = this.pubsub;
    return function PreviewPlugin() {
      return <PreviewServerStatus previewServers={previewServers} pubsub={pubsub} />;
    };
  }
}
