import { Command, CommandOptions } from '@teambit/cli';
import { PubsubMain } from '@teambit/pubsub';
import { Logger } from '@teambit/logger';
import { MainDevServerAspect } from '@teambit/main-dev-server';

import type { WorkerMain } from '@teambit/worker';
import type { MainDevServerMain } from '@teambit/main-dev-server';

import React from 'react';
import { render } from 'ink';

import type { UiMain } from '../ui.main.runtime';
import { CliOutput } from './cli-output';
import { report } from './report';
import execa from 'execa';

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
     * main dev server
     */
    private mainDevServer: MainDevServerMain,

    /**
     * worker, run in different process.
     */
    private worker: WorkerMain,

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

  // private asyncRender(startingTimestamp, pubsub, commandFlags, uiServer) {
  //   render(
  //     <CliOutput
  //       startingTimestamp={startingTimestamp}
  //       pubsub={pubsub}
  //       commandFlags={commandFlags}
  //       uiServer={uiServer}
  //     />
  //   );
  // }

  // private clearConsole() {
  //   process.stdout.write(process.platform === 'win32' ? '\x1B[2J\x1B[0f' : '\x1B[2J\x1B[3J\x1B[H');
  // }

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

    const spawnOptions = {
      aspectId: MainDevServerAspect.id,
      execMethodName: 'run',
      params: [uiRootName, pattern, dev, port, rebuild],
    };
    this.worker.spawn(spawnOptions);

    return (
      // render(
      <>
        <CliOutput
          startingTimestamp={Date.now()}
          pubsub={this.pubsub}
          commandFlags={{ dev: !!dev, port, verbose: !!verbose, suppressBrowserLaunch: !!suppressBrowserLaunch }}
          mainUIServer={null} // Didn't start yet
        />
      </>
    );
  }
}
