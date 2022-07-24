import React from 'react';
import pluralize from 'pluralize';
import { Command, CommandOptions } from '@teambit/cli';
import { Newline, Text } from 'ink';
import { Logger } from '@teambit/logger';
import { ApplicationMain } from './application.main.runtime';
import { RenderResult } from '../../../src/cli/command';

type RunOptions = {
  dev: boolean;
  verbose: boolean;
  skipWatch: boolean;
  ssr: boolean;
};

export class RunCmd implements Command {
  name = 'run <app-name>';
  description = "run an app (independent of bit's dev server)";
  arguments = [
    {
      name: 'app-name',
      description:
        "the app's name is registered by the app (run 'bit app list' to list the names of the available apps)",
    },
  ];
  alias = 'c';
  group = 'apps';
  options = [
    ['d', 'dev', 'start the application in dev mode.'],
    ['v', 'verbose', 'showing verbose output for inspection and prints stack trace'],
    ['', 'skip-watch', 'avoid running the watch process that compiles components in the background'],
    ['', 'ssr', 'run app in server side rendering mode.'],
  ] as CommandOptions;

  constructor(
    /**
     * access to the extension instance.
     */
    private application: ApplicationMain,

    private logger: Logger
  ) {}

  async render([appName]: [string], { dev, skipWatch, ssr }: RunOptions): Promise<React.ReactElement | RenderResult> {
    // remove wds logs until refactoring webpack to a worker through the Worker aspect.
    const { port, errors } = await this.application.runApp(appName, {
      dev,
      watch: !skipWatch,
      ssr,
    });

    if (errors) {
      return {
        code: 1,
        data: <ShowErrors errors={errors} />,
      };
    }

    if (port) {
      return (
        <Text>
          {appName} app is running on http://localhost:{port}
        </Text>
      );
    }
    return <Text>{appName} app is running</Text>;
  }
}

function ShowErrors({ errors }: { errors: Error[] }) {
  return (
    <>
      <Newline />
      <Text underline>Fatal {pluralize('error', errors.length)}:</Text>
      {errors.map((x, idx) => (
        <Text key={idx}>{x.toString()}</Text>
      ))}
    </>
  );
}
