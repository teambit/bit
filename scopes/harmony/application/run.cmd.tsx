import React from 'react';
import { Command, CommandOptions } from '@teambit/cli';
import { Text } from 'ink';
import { Logger } from '@teambit/logger';
import { ApplicationMain } from './application.main.runtime';

export class RunCmd implements Command {
  name = 'run <app>';
  description = 'run an application';
  alias = 'c';
  group = 'apps';
  shortDescription = '';
  options = [
    ['d', 'dev', 'start the application in dev mode.'],
    ['v', 'verbose', 'showing verbose output for inspection and prints stack trace'],
  ] as CommandOptions;

  constructor(
    /**
     * access to the extension instance.
     */
    private application: ApplicationMain,

    private logger: Logger
  ) {}

  async report(
    [appName]: [string],
    { dev, verbose }: { dev: boolean; port: string; rebuild: boolean; verbose: boolean; suppressBrowserLaunch: boolean }
  ): Promise<string> {
    this.logger.off();

    const appServer = await this.application.runApp(appName, {
      dev,
    });

    return `${appName} has started`;
  }

  async render(
    [appName]: [string],
    { dev, verbose }: { dev: boolean; port: string; rebuild: boolean; verbose: boolean; suppressBrowserLaunch: boolean }
  ): Promise<React.ReactElement> {
    // remove wds logs until refactoring webpack to a worker through the Worker aspect.
    const appServer = await this.application.runApp(appName, {
      dev,
    });

    return <Text>{appName} has started</Text>;
    // return <UIServerConsole appName={appName} futureUiServer={uiServer} />;
  }
}
