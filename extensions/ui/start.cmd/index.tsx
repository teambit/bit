import { Command, CommandOptions } from '@teambit/cli';
import { PubsubMain } from '@teambit/pubsub';
import { Logger } from '@teambit/logger';
import { WorkspaceAspect } from '@teambit/workspace';

import React from 'react';
// import fs from 'fs-extra';
// import through2 from 'through2';
// const { Writable, pipeline, Transform } = require('stream');
// var intercept = require("intercept-stdout");
// import { Filter } from './filter';
import { Newline, Text, render } from 'ink';

import type { UiMain } from '../ui.main.runtime';
import { CliOutput } from './cli-output';
import { ClearConsole } from './output-templates';
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

  private asyncRender(workspaceID, startingTimestamp, pubsub, commandFlags) {
    render(
      <CliOutput
        workspaceID={workspaceID}
        startingTimestamp={startingTimestamp}
        pubsub={pubsub}
        commandFlags={commandFlags}
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

    // await this.ui.createRuntime({
    this.ui
      .createRuntime({
        uiRootName,
        pattern,
        dev,
        port: port ? parseInt(port) : undefined,
        rebuild,
      })
      .then(() => {
        setTimeout(() => {
          this.clearConsole();

          const workspaceID = WorkspaceAspect.id;
          const startingTimestamp = Date.now();
          const pubsub = this.pubsub;
          const commandFlags = { dev: !!dev, port, verbose: !!verbose, suppressBrowserLaunch: !!suppressBrowserLaunch };

          setTimeout(() => {
            this.asyncRender(workspaceID, startingTimestamp, pubsub, commandFlags);
          }, 200);
        }, 0);
      });

    return (
      <>
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
