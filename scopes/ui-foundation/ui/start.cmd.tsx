import React from 'react';
import openBrowser from 'react-dev-utils/openBrowser';
import { Command, CommandOptions } from '@teambit/cli';
import { Logger } from '@teambit/logger';
import { BitError } from '@teambit/bit-error';
import { UIServerConsole } from '@teambit/ui-foundation.cli.ui-server-console';
import type { UiMain } from './ui.main.runtime';

type StartArgs = [uiName: string, userPattern: string];
type StartFlags = {
  dev: boolean;
  port: string;
  rebuild: boolean;
  verbose: boolean;
  noBrowser: boolean;
  skipCompilation: boolean;
  skipUiBuild: boolean;
};

export class StartCmd implements Command {
  name = 'start [type] [pattern]';
  description = 'run the ui/development server';
  alias = 'c';
  group = 'development';
  options = [
    ['d', 'dev', 'start UI server in dev mode.'],
    ['p', 'port [port-number]', 'port of the UI server.'],
    ['r', 'rebuild', 'rebuild the UI'],
    ['r', 'skip-ui-build', 'skip building UI'],
    ['v', 'verbose', 'show verbose output for inspection and prints stack trace'],
    ['', 'no-browser', 'do not automatically open browser when ready'],
    ['', 'skip-compilation', 'skip the auto-compilation before starting the web-server'],
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
    [uiRootName, userPattern]: StartArgs,
    { dev, port, rebuild, verbose, noBrowser, skipCompilation, skipUiBuild }: StartFlags
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
