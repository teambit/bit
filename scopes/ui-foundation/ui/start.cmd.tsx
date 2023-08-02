import { BitError } from '@teambit/bit-error';
import { Command, CommandOptions } from '@teambit/cli';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy/dist/constants';
import { Logger } from '@teambit/logger';
import { UIServerConsole } from '@teambit/ui-foundation.cli.ui-server-console';
import React from 'react';
import openBrowser from 'react-dev-utils/openBrowser';
import type { UiMain } from './ui.main.runtime';

type StartArgs = [userPattern: string];
type StartFlags = {
  dev: boolean;
  port: string;
  rebuild: boolean;
  verbose: boolean;
  noBrowser: boolean;
  skipCompilation: boolean;
  skipUiBuild: boolean;
  uiRootName: string;
};

export class StartCmd implements Command {
  name = 'start [component-pattern]';
  description = 'run the ui/development server';
  arguments = [
    {
      name: 'component-pattern',
      description: COMPONENT_PATTERN_HELP,
    },
  ];
  alias = 'c';
  group = 'development';
  options = [
    ['d', 'dev', 'start UI server in dev mode.'],
    ['p', 'port [port-number]', 'port of the UI server.'],
    ['r', 'rebuild', 'rebuild the UI (useful e.g. when the bundler config has been changed in the env)'],
    ['', 'skip-ui-build', 'skip building UI'],
    ['v', 'verbose', 'show verbose output for inspection and prints stack trace'],
    ['n', 'no-browser', 'do not automatically open browser when ready'],
    ['', 'skip-compilation', 'skip the auto-compilation before starting the web-server'],
    [
      'u',
      'ui-root-name [type]',
      'name of the ui root to use, e.g. "teambit.scope/scope" or "teambit.workspace/workspace"',
    ],
  ] as CommandOptions;

  constructor(
    /**
     * access to the extension instance.
     */
    private ui: UiMain,

    private logger: Logger
  ) {}

  // async report([uiRootName, userPattern]: StartArgs, { dev, port, rebuild, verbose }: StartFlags): Promise<string> {
  //   this.logger.off();
  //   const pattern = userPattern && userPattern.toString();

  //   const uiServer = await this.ui.createRuntime({
  //     uiRootName,
  //     pattern,
  //     dev,
  //     port: port ? parseInt(port) : undefined,
  //     rebuild,
  //     verbose,
  //   });

  //   return `Bit server has started on port ${uiServer.port}`;
  // }

  async render(
    [userPattern]: StartArgs,
    { dev, port, rebuild, verbose, noBrowser, skipCompilation, skipUiBuild, uiRootName }: StartFlags
  ): Promise<React.ReactElement> {
    this.logger.off();
    if (!this.ui.isHostAvailable()) {
      throw new BitError(
        `bit start can only be run inside a bit workspace or a bit scope - please ensure you are running the command in the correct directory`
      );
    }
    const appName = this.ui.getUiName(uiRootName);
    await this.ui.invokePreStart({ skipCompilation });
    const uiServer = this.ui.createRuntime({
      uiRootName,
      skipUiBuild,
      pattern: userPattern,
      dev,
      port: +port,
      rebuild,
      verbose,
    });

    if (!noBrowser) {
      uiServer
        .then(async (server) => {
          if (!server.buildOptions?.launchBrowserOnStart) return undefined;

          await server.whenReady;

          return openBrowser(this.ui.publicUrl || server.fullUrl);
        })
        .catch((error) => this.logger.error(error));
    }

    // DO NOT CHANGE THIS - this meant to be an async hook.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.ui.invokeOnStart();
    this.ui.clearConsole();

    return <UIServerConsole appName={appName} futureUiServer={uiServer} url={this.ui.publicUrl} />;
  }
}
