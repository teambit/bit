import React from 'react';
import { Command, CommandOptions } from '@teambit/cli';
import { Logger } from '@teambit/logger';
import { UIServerConsole } from '@teambit/ui-foundation.cli.ui-server-console';
import type { UiMain } from './ui.main.runtime';

export class StartCmd implements Command {
  name = 'start [type] [pattern]';
  description = 'Start a dev environment for a workspace or a specific component';
  alias = 'c';
  group = 'development';
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

    private logger: Logger
  ) {}

  async report(
    [uiRootName, userPattern]: [string, string],
    {
      dev,
      port,
      rebuild,
      verbose,
    }: { dev: boolean; port: string; rebuild: boolean; verbose: boolean; suppressBrowserLaunch: boolean }
  ): Promise<string> {
    this.logger.off();
    const pattern = userPattern && userPattern.toString();

    const uiServer = await this.ui.createRuntime({
      uiRootName,
      pattern,
      dev,
      port: port ? parseInt(port) : undefined,
      rebuild,
      verbose,
    });

    return `Bit server has started on port ${uiServer.port}`;
  }

  async render(
    [uiRootName, userPattern]: [string, string],
    {
      dev,
      port,
      rebuild,
      verbose,
    }: { dev: boolean; port: string; rebuild: boolean; verbose: boolean; suppressBrowserLaunch: boolean }
  ): Promise<React.ReactElement> {
    // remove wds logs until refactoring webpack to a worker through the Worker aspect.
    // const processWrite = process.stdout.write.bind(process.stdout);
    // process.stdout.write = (data, cb) => {
    //   if (data.includes('｢wds｣') && !verbose) return processWrite('', cb);
    //   return processWrite(data, cb);
    // };

    const pattern = userPattern && userPattern.toString();
    this.logger.off();
    const ui = this.ui.getUi();
    if (!ui) throw new Error('ui not found');
    const [, uiRoot] = ui;
    const appName = uiRoot.name;
    const uiServer = this.ui.createRuntime({
      uiRootName,
      pattern,
      dev,
      port: port ? parseInt(port) : undefined,
      rebuild,
      verbose,
    });

    // DO NOT CHANGE THIS - this meant to be an async hook.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.ui.invokeOnStart();
    this.ui.clearConsole();

    return <UIServerConsole appName={appName} futureUiServer={uiServer} />;
  }
}
