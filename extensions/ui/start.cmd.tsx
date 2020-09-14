import { Command, CommandOptions } from '@teambit/cli';
import { PubsubMain } from '@teambit/pubsub';
import { Logger } from '@teambit/logger';

import React from 'react';
import open from 'open';
import { render } from 'ink';

// import { UIServerConsole } from './bit-start-cmd-output-templates/env-console';
import type { UiMain } from './ui.main.runtime';
import {
  Starting,
  ClearConsole,
  compilationEndedSuccessfullyOutput,
  ComponentPreviewServerStarted,
  UIServersAreReady,
} from './bit-start-cmd-output-templates';

export class StartCmd implements Command {
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
    pubsub.subscribeToTopic('teambit.bit/ui', this.eventsListeners);
    pubsub.subscribeToTopic('teambit.bit/webpack', this.eventsListeners);
    pubsub.subscribeToTopic('teambit.bit/bundler', this.eventsListeners);
  }

  private eventsListeners = (event) => {
    // console.log('--event-->: ', event)

    switch (event.type) {
      case 'components-server-started':
        setTimeout(() => this.onComponentsServerStarted(event), 500);
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
    this.devServerCounter += 1;
    render(<ComponentPreviewServerStarted host={event.body.hostname} port={event.body.port} />);
    console.log('');
  };

  private openBrowserOn0() {
    if (this.devServerCounter === 0) {
      console.log('');
      render(<UIServersAreReady host={this.targetHost} port={this.targetPort} />);

      setTimeout(() => open(`http://${this.targetHost}:${this.targetPort}/`), 500);

      // open(`http://${this.targetHost}:${this.targetPort}/`);
    }
  }

  async render(
    [uiRootName, userPattern]: [string, string],
    { dev, port, rebuild }: { dev: boolean; port: string; rebuild: boolean }
  ): Promise<React.ReactElement> {
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
        <ClearConsole />
        <Starting />
      </>
    );
  }
}
