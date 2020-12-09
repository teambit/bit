import { Command, CommandOptions } from '@teambit/cli';
import { PubsubMain } from '@teambit/pubsub';
import { Logger } from '@teambit/logger';

import React from 'react';
import { render } from 'ink';

import type { UiMain } from '../ui.main.runtime';
import { CliOutput } from './cli-output';
import { report } from './report';

export class StartCmd implements Command {
  startingtimestamp;
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
    ['', 'suppress-browser-launch', 'do not automatically open browser when ready'],
  ] as CommandOptions;

  constructor(
    /**
     * access to the extension instance.
     */
    private ui: UiMain,

    private logger: Logger,

    private pubsub: PubsubMain
  ) {}

  async report(
    [uiRootName, userPattern]: [string, string],
    {
      dev,
      port,
      rebuild,
    }: { dev: boolean; port: string; rebuild: boolean; verbose: boolean; suppressBrowserLaunch: boolean }
  ): Promise<string> {
    return report([uiRootName, userPattern], { dev, port, rebuild }, this.ui, this.logger, this.pubsub);
  }

  private asyncRender(startingTimestamp, pubsub, commandFlags, uiServer) {
    render(
      <CliOutput
        startingTimestamp={startingTimestamp}
        pubsub={pubsub}
        commandFlags={commandFlags}
        uiServer={uiServer}
      />
    );
  }

  private clearConsole() {
    process.stdout.write(process.platform === 'win32' ? '\x1B[2J\x1B[0f' : '\x1B[2J\x1B[3J\x1B[H');
  }

  async render(
    [uiRootName, userPattern]: [string, string],
    {
      dev,
      port,
      rebuild,
      verbose,
      suppressBrowserLaunch,
    }: { dev: boolean; port: string; rebuild: boolean; verbose: boolean; suppressBrowserLaunch: boolean }
  ): Promise<React.ReactElement> {
    this.startingtimestamp = Date.now();

    const pattern = userPattern && userPattern.toString();
    this.logger.off();

    this.ui
      .createRuntime({
        uiRootName,
        pattern,
        dev,
        port: port ? parseInt(port) : undefined,
        rebuild,
      })
      .then((uiServer) => {
        setTimeout(() => {
          this.clearConsole();

          const startingTimestamp = Date.now();
          const pubsub = this.pubsub;
          const commandFlags = { dev: !!dev, port, verbose: !!verbose, suppressBrowserLaunch: !!suppressBrowserLaunch };

          setTimeout(() => {
            this.asyncRender(startingTimestamp, pubsub, commandFlags, uiServer);
          }, 200);
        }, 0);
      })
      .catch((e) => {
        throw e;
      });

    return (
      <>
        <CliOutput
          startingTimestamp={Date.now()}
          pubsub={this.pubsub}
          commandFlags={{ dev: !!dev, port, verbose: !!verbose, suppressBrowserLaunch: true }}
          uiServer={null} // Didn't start yet
        />
      </>
    );
  }
}
