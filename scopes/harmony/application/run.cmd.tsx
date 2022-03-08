import React from 'react';
import { Command, CommandOptions } from '@teambit/cli';
import { Text } from 'ink';
import { Logger } from '@teambit/logger';
import { ApplicationMain } from './application.main.runtime';

type RunOptions = {
  dev: boolean;
  verbose: boolean;
  skipWatch: boolean;
};

export class RunCmd implements Command {
  name = 'run <app>';
  description = 'run an application';
  alias = 'c';
  group = 'apps';
  options = [
    ['d', 'dev', 'start the application in dev mode.'],
    ['v', 'verbose', 'showing verbose output for inspection and prints stack trace'],
    ['', 'skip-watch', 'avoid running the watch process that compiles components in the background'],
  ] as CommandOptions;

  constructor(
    /**
     * access to the extension instance.
     */
    private application: ApplicationMain,

    private logger: Logger
  ) {}

  async render([appName]: [string], { dev, skipWatch }: RunOptions): Promise<React.ReactElement> {
    // remove wds logs until refactoring webpack to a worker through the Worker aspect.
    const { port } = await this.application.runApp(appName, {
      dev,
      skipWatch,
    });

    if (port) {
      return (
        <Text>
          {appName} app is running on http://localhost:{port}
        </Text>
      );
    }
    return <Text>{appName} app is running</Text>;
    // return <UIServerConsole appName={appName} futureUiServer={uiServer} />;
  }
}
