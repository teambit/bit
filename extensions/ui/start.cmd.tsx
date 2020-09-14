import { Command, CommandOptions } from '@teambit/cli';
import { PubsubMain } from '@teambit/pubsub';
import { Logger } from '@teambit/logger';

import React from 'react';
import open from 'open';

import { UIServerConsole } from './env-console';
import type { UiMain } from './ui.main.runtime';

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
    switch (event.type) {
      case 'components-server-started':
        this.devServerCounter += 1;
        break;
      case 'webpack-compilation-done':
        this.devServerCounter -= 1;
        this.openBrowserOn0();
        break;
      case 'ui-server-started':
        this.targetHost = event.body.targetHost;
        this.targetPort = event.body.targetPort;
        break;
      default:
    }
  };

  private openBrowserOn0() {
    if (this.devServerCounter === 0) {
      open(`http://${this.targetHost}:${this.targetPort}/`);
    }
  }

  private clearConsole() {
    process.stdout.write(process.platform === 'win32' ? '\x1B[2J\x1B[0f' : '\x1B[2J\x1B[3J\x1B[H');
  }

  async render(
    [uiRootName, userPattern]: [string, string],
    { dev, port, rebuild }: { dev: boolean; port: string; rebuild: boolean }
  ): Promise<React.ReactElement> {
    // teambit.bit/variants should be the one to take care of component patterns.
    const pattern = userPattern && userPattern.toString();
    this.logger.off();
    const uiServer = await this.ui.createRuntime({
      uiRootName,
      pattern,
      dev,
      port: port ? parseInt(port) : undefined,
      rebuild,
    });

    // clear the user console before moving interactive.
    this.clearConsole();

    return <UIServerConsole uiServer={uiServer} />;
  }
}
