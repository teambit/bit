import { Command, CommandOptions } from '@teambit/cli';
import { PubsubMain } from '@teambit/pubsub';
import { Logger } from '@teambit/logger';
import { WorkspaceAspect } from '@teambit/workspace';

import React from 'react';
import open from 'open';
import { render } from 'ink';
import prettyTime from 'pretty-time';

import type { UiMain } from './ui.main.runtime';
import {
  StartingMainUiServer,
  StandaloneNewLine,
  Starting,
  ClearConsole,
  compilationEndedSuccessfullyOutput,
  ComponentPreviewServerStarted,
  ComponentPreviewServerStartedHeaders,
  UIServersAreReady,
} from './bit-start-cmd-output-templates';

export class StartCmd implements Command {
  items: any[] = [];

  startingtimestamp;
  devServerCounter = 0;
  targetHost = 'localhost';
  targetPort = 3000;
  name = 'start [type] [pattern]';
  description = 'Start a dev environment for a workspace or a specific component';
  alias = 'c';
  group = 'component';
  shortDescription = '';
  options = [
    ['d', 'dev', 'start UI server in dev mode.'],
    ['p', 'port', 'port of the UI server.'],
    ['r', 'rebuild', 'rebuild the UI'],
    ['v', 'verbose', 'showing verbose output for inspection and prints stack trace'],
  ] as CommandOptions;

  constructor(
    /**
     * access to the extension instance.
     */
    private ui: UiMain,

    private logger: Logger,

    private pubsub: PubsubMain
  ) {
    pubsub.sub('teambit.bit/ui', this.eventsListeners);
    pubsub.sub('teambit.bit/webpack', this.eventsListeners);
    pubsub.sub('teambit.bit/bundler', this.eventsListeners);
  }

  private eventsListeners = (event) => {
    switch (event.type) {
      case 'components-server-started':
        // Do not remove thetimeout or the component might be removed by theClearConsole(!)
        setTimeout(() => this.onComponentsServerStarted(event), 300);
        break;
      case 'webpack-compilation-done':
        // Do not remove thetimeout or the component might be removed by theClearConsole(!)
        setTimeout(() => this.onWebpackCompilationDone(event), 0);
        break;
      case 'ui-server-started':
        this.onUiServerStarted(event);
        break;
      default:
    }
  };

  private onUiServerStarted = (event) => {
    this.targetHost = event.body.targetHost;
    this.targetPort = event.body.targetPort;
  };

  private onWebpackCompilationDone = (event) => {
    this.devServerCounter -= 1;
    this.openBrowserOn0();
  };

  private onComponentsServerStarted(event) {
    this.devServerCounter += 1;
    this.items.push({
      envName: event.body.executionContext.envRuntime.id,
      host: event.body.hostname,
      port: event.body.port,
      timestamp: this.getDuration(),
    });
    render(
      <>
        <ComponentPreviewServerStarted items={this.items} />
        <StandaloneNewLine />
        <StartingMainUiServer workspace={WorkspaceAspect} />
      </>
    );
  }

  private openBrowserOn0() {
    if (this.devServerCounter === 0) {
      render(
        <>
          <ComponentPreviewServerStarted items={this.items} />
          <StandaloneNewLine />
          <UIServersAreReady
            host={this.targetHost}
            port={this.targetPort}
            timestamp={this.getDuration()}
            workspace={WorkspaceAspect}
          />
        </>
      );

      setTimeout(() => open(`http://${this.targetHost}:${this.targetPort}/`), 500);
    }
  }

  private getDuration() {
    const duration = Date.now() - this.startingtimestamp;
    return prettyTime(duration);
  }

  async render(
    [uiRootName, userPattern]: [string, string],
    { dev, port, rebuild, verbose }: { dev: boolean; port: string; rebuild: boolean; verbose: boolean }
  ): Promise<React.ReactElement> {
    this.startingtimestamp = Date.now();
    const pattern = userPattern && userPattern.toString();
    this.logger.off();
    const uiServer = await this.ui.createRuntime({
      uiRootName,
      pattern,
      dev,
      port: port ? parseInt(port) : undefined,
      rebuild,
    });

    return (
      <>
        {verbose ? <StandaloneNewLine /> : <ClearConsole />}
        <Starting workspace={WorkspaceAspect} />
      </>
    );
  }
}
