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
  Starting,
  ClearConsole,
  compilationEndedSuccessfullyOutput,
  ComponentPreviewServerStarted,
  ComponentPreviewServerStartedHeaders,
  UIServersAreReady,
} from './bit-start-cmd-output-templates';

export class StartCmd implements Command {
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
        setTimeout(() => this.onComponentsServerStarted(event), 0);
        break;
      case 'webpack-compilation-done':
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

  private onComponentsServerStarted = (event) => {
    this.getDuration();
    this.devServerCounter += 1;
    // console.log(''); // TODO: New line with ink
    // console.log(''); // TODO: New line with ink
    render(
      <ComponentPreviewServerStarted
        envName={event.body.executionContext.envRuntime.id}
        host={event.body.hostname}
        port={event.body.port}
        timestamp={this.getDuration()}
      />
    );
  };

  private openBrowserOn0() {
    if (this.devServerCounter === 0) {
      console.log(''); // TODO: New line with ink
      console.log(''); // TODO: New line with ink
      render(
        <UIServersAreReady
          host={this.targetHost}
          port={this.targetPort}
          timestamp={this.getDuration()}
          workspace={WorkspaceAspect}
        />
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
    { dev, port, rebuild }: { dev: boolean; port: string; rebuild: boolean }
  ): Promise<React.ReactElement> {
    this.startingtimestamp = Date.now();
    console.log('');
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
        {/* <ClearConsole /> */}
        <Starting workspace={WorkspaceAspect} />
        <ComponentPreviewServerStartedHeaders />
      </>
    );
  }
}
