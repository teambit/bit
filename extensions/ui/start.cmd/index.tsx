/**
 * TODO[uri] - refactor to full blown React app (with state).
 */
import { Command, CommandOptions } from '@teambit/cli';
import { PubsubMain } from '@teambit/pubsub';
import { Logger } from '@teambit/logger';
import { WorkspaceAspect } from '@teambit/workspace';

import React from 'react';

import type { UiMain } from './ui.main.runtime';
import { CliOutput } from './cli-output';
import { ClearConsole } from './output-templates';

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

    this.ui.createRuntime({
      uiRootName,
      pattern,
      dev,
      port: port ? parseInt(port) : undefined,
      rebuild,
    });

    return (
      <>
        <ClearConsole verbose={!!verbose} />
        <CliOutput
          workspaceID={WorkspaceAspect.id}
          startingTimestamp={Date.now()}
          pubsub={this.pubsub}
          commandFlags={{ dev: !!dev, port, verbose: !!verbose, suppressBrowserLaunch: !!suppressBrowserLaunch }}
        />
      </>
    );
  }
}
