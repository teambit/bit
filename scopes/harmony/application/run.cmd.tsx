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
    { dev }: { dev: boolean; port: string; rebuild: boolean; verbose: boolean; suppressBrowserLaunch: boolean }
  ): Promise<string> {
    this.logger.off();

    const { port } = await this.application.runApp(appName, {
      dev,
    });

    return `${appName} has started on port ${port}`;
  }

  async render(
    [appName]: [string],
    { dev }: { dev: boolean; rebuild: boolean; verbose: boolean; suppressBrowserLaunch: boolean }
  ): Promise<React.ReactElement> {
    // remove wds logs until refactoring webpack to a worker through the Worker aspect.
    const { port } = await this.application.runApp(appName, {
      dev,
    });

    return (
      <Text>
        {appName} has started on port {port}
      </Text>
    );
    // return <UIServerConsole appName={appName} futureUiServer={uiServer} />;
  }
}
