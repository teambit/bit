import React, { useState } from 'react';
import { flatten } from 'lodash';
import { PreviewServerStatus } from '@teambit/preview.cli.preview-server-status';
import { BundlerMain, ComponentServer } from '@teambit/bundler';
import { PubsubMain } from '@teambit/pubsub';
import { StartPlugin, StartPluginOptions, UiMain } from '@teambit/ui';
import { Workspace } from '@teambit/workspace';
import { SubscribeToWebpackEvents, CompilationResult } from '@teambit/preview.cli.webpack-events-listener';

type CompilationServers = Record<string, CompilationResult>;

export class PreviewStartPlugin implements StartPlugin {
  constructor(
    private workspace: Workspace,
    private bundler: BundlerMain,
    private ui: UiMain,
    private pubsub: PubsubMain
  ) {}

  previewServers: ComponentServer[] = [];

  async initiate(options: StartPluginOptions) {
    this.listenToDevServers();

    const components = await this.workspace.byPattern(options.pattern || '');
    // TODO: logic for creating preview servers must be refactored to this aspect from the DevServer aspect.
    const previewServers = await this.bundler.devServer(components);
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
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
        onUnlink: () => {},
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

  // TODO: this should be a part of the devServer
  private listenToDevServers() {
    // keep state changes immutable!
    SubscribeToWebpackEvents(this.pubsub, {
      onStart: (id) => {
        this.updateServers((state) => ({
          ...state,
          [id]: { compiling: true },
        }));
      },
      onDone: (id, results) => {
        this.updateServers((state) => ({
          ...state,
          [id]: results,
        }));
      },
    });
  }

  private initialState: CompilationServers = {};
  // implements react-like setter (value or updater)
  private updateServers: React.Dispatch<React.SetStateAction<CompilationServers>> = (servers) => {
    this.initialState = typeof servers === 'function' ? servers(this.initialState) : servers;
    return servers;
  };

  render() {
    const PreviewPlugin = () => {
      const [servers, setServers] = useState<CompilationServers>(this.initialState);
      this.updateServers = setServers;
      this.initialState = {};

      return <PreviewServerStatus previewServers={this.previewServers} serverStats={servers} />;
    };

    return PreviewPlugin;
  }
}
