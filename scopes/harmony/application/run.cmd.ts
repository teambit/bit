import chalk from 'chalk';
import type { Command, CommandOptions } from '@teambit/cli';
import { formatItem, formatSection } from '@teambit/cli';
import type { Logger } from '@teambit/logger';
import open from 'open';
import type { ApplicationMain } from './application.main.runtime';
import { runCommand } from './application.commands';

function openBrowser(url: string): Promise<void> {
  const openUrl =
    process.env.BIT_VSCODE_EXTENSION === 'true'
      ? `vscode://bit.vscode-bit/open-browser?url=${encodeURIComponent(url)}`
      : url;
  return open(openUrl).then(() => undefined);
}

type RunOptions = {
  dev: boolean;
  verbose: boolean;
  skipWatch: boolean;
  watch: boolean;
  ssr: boolean;
  port: string;
  args: string;
  noBrowser: boolean;
};

export class RunCmd implements Command {
  name = runCommand.name;
  description = runCommand.description;
  extendedDescription = runCommand.extendedDescription;
  helpUrl = runCommand.helpUrl;
  arguments = runCommand.arguments;
  alias = runCommand.alias;
  group = runCommand.group;
  options = runCommand.options;

  constructor(
    /**
     * access to the extension instance.
     */
    private application: ApplicationMain,

    private logger: Logger
  ) {}

  async wait([appName]: [string], { dev, watch, ssr, port: exactPort, args, noBrowser }: RunOptions) {
    const idsAndNames = await this.application.listAppsIdsAndNames();
    if (!idsAndNames.length) {
      this.logger.console('no apps found');
      process.exit(1);
    }
    const resolvedApp = appName ? appName : idsAndNames.length === 1 ? idsAndNames[0].name : undefined;
    if (!resolvedApp) {
      const runStr = chalk.cyan(`bit run <app-name>`);
      const sortedNames = idsAndNames.map(({ name }) => name).sort((a, b) => a.localeCompare(b));
      const items = sortedNames.map((name) => formatItem(name));
      const section = formatSection('available apps', '', items);
      this.logger.console(`multiple apps found, please specify one using "${runStr}".\n\n${section}`);
      process.exit(1);
    }
    // remove wds logs until refactoring webpack to a worker through the Worker aspect.
    this.logger.off();
    const { port, errors, isOldApi } = await this.application.runApp(resolvedApp, {
      dev,
      watch,
      ssr,
      port: +exactPort,
      args,
    });

    if (errors) {
      const errStr =
        errors && errors.length ? errors.map((err) => err.toString()).join('\n') : 'unknown error occurred';
      this.logger.console(errStr);
      process.exit(1);
    }

    if (isOldApi) {
      const url = `http://localhost:${port}`;
      this.logger.console(`${appName} app is running on ${url}`);

      if (!noBrowser && port) {
        await openBrowser(url);
      }
    } else if (port) {
      // New API - also open browser when port is available
      const url = `http://localhost:${port}`;
      // this.logger.console(`${appName} app is running on ${url}`);

      if (!noBrowser) {
        await openBrowser(url);
      }
    }

    /**
     * normally, when running "bit run <app-name>", the app is running in the background, which keeps the event loop busy.
     * when the even loop is busy, the process doesn't exit, which is what we're looking for.
     *
     * however, if the app is not running in the background, the event loop is free, and the process exits. this is
     * very confusing to the end user, because there is no error and no message indicating what's happening.
     *
     * this "beforeExit" event is a good place to catch this case and print a message to the user.
     * it's better than using "exit" event, which can caused by the app itself running "process.exit".
     * "beforeExit" is called when the event loop is empty and the process is about to exit.
     */
    process.on('beforeExit', (code) => {
      if (code === 0) {
        this.logger.console('no app is running in the background, please check your app');
      }
    });
  }
}
