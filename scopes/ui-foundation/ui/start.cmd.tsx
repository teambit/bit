import React, { useEffect, useState } from 'react';
import { Text, Newline } from 'ink';
import open from 'open';
import { UIServerLoader } from '@teambit/ui-foundation.cli.ui-server-loader';
import { Command, CommandOptions } from '@teambit/cli';
import { Logger } from '@teambit/logger';
// import { UIServerConsole } from '@teambit/ui-foundation.cli.ui-server-console';
import type { UiMain } from './ui.main.runtime';
import { UIServer } from './ui-server';

type StartArgs = [uiName: string, userPattern: string];
type StartFlags = {
  dev: boolean;
  port: string;
  rebuild: boolean;
  verbose: boolean;
  noBrowser: boolean;
  skipCompilation: boolean;
};

export class StartCmd implements Command {
  name = 'start [type] [pattern]';
  description = 'Start a dev environment for a workspace or a specific component';
  alias = 'c';
  group = 'development';
  shortDescription = '';
  options = [
    ['d', 'dev', 'start UI server in dev mode.'],
    ['p', 'port [number]', 'port of the UI server.'],
    ['r', 'rebuild', 'rebuild the UI'],
    ['v', 'verbose', 'showing verbose output for inspection and prints stack trace'],
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
    { dev, port, rebuild, verbose, noBrowser, skipCompilation }: StartFlags
  ): Promise<React.ReactElement> {
    this.logger.off();
    const appName = this.ui.getUiName(uiRootName);
    await this.ui.invokePreStart({ skipCompilation });
    const uiServer = this.ui.createRuntime({
      uiRootName,
      pattern: userPattern,
      dev,
      port: +port,
      rebuild,
      verbose,
    });

    if (!noBrowser) {
      uiServer
        .then((server) => {
          if (!server.buildOptions?.launchBrowserOnStart) return undefined;

          return open(this.ui.publicUrl || server.fullUrl);
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

type UIServerConsoleProps = {
  /**
   * future of the ui server.
   */
  futureUiServer: Promise<UIServer>;

  /**
   * name of the app.
   */
  appName?: string;

  /** explicity server url */
  url?: string;
};

function UIServerConsole({ appName, futureUiServer, url }: UIServerConsoleProps) {
  const [uiServer, setUiServer] = useState<UIServer>();

  useEffect(() => {
    futureUiServer
      .then((server) => setUiServer(server))
      .catch((err) => {
        throw err;
      });
  });

  if (!uiServer) return <UIServerLoader name={appName} />;
  const plugins = uiServer.getPluginsComponents();

  return (
    <>
      {plugins.map((Plugin, key) => {
        return <Plugin key={key} />;
      })}
      <Newline />
      <Text>
        You can now view '<Text color="cyan">{uiServer?.getName()}</Text>' components in the browser.
      </Text>
      <Text>Bit server is running on {url || uiServer.fullUrl}</Text>
    </>
  );
}
