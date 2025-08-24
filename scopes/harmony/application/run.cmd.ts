import chalk from 'chalk';
import type { Command, CommandOptions } from '@teambit/cli';
import type { Logger } from '@teambit/logger';
import open from 'open';
import type { ApplicationMain } from './application.main.runtime';

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
  name = 'run [app-name]';
  description = "locally run an app component (independent of bit's dev server)";
  helpUrl = 'reference/apps/apps-overview/';
  arguments = [
    {
      name: 'app-name',
      description:
        "the app's name is registered by the app (run 'bit app list' to list the names of the available apps)",
    },
  ];
  alias = 'c';
  group = 'run-serve';
  options = [
    ['d', 'dev', 'start the application in dev mode.'],
    ['p', 'port [port-number]', 'port to run the app on'],
    ['v', 'verbose', 'show verbose output for inspection and print stack trace'],
    // ['', 'skip-watch', 'avoid running the watch process that compiles components in the background'],
    ['w', 'watch', 'watch and compile your components upon changes'],
    ['n', 'no-browser', 'do not automatically open browser when ready'],
    [
      'a',
      'args <argv>',
      'the arguments passing to the app. for example, --args="--a=1 --b". don\'t forget to use quotes to wrap the value to escape special characters.',
    ],
  ] as CommandOptions;

  constructor(
    /**
     * access to the extension instance.
     */
    private application: ApplicationMain,

    private logger: Logger
  ) {}

  async wait([appName]: [string], { dev, watch, ssr, port: exactPort, args, noBrowser }: RunOptions) {
    const ids = await this.application.loadAllAppsAsAspects();
    if (!ids.length) {
      this.logger.console('no apps found');
      process.exit(1);
    }
    const resolvedApp = appName ? appName : ids.length === 1 ? ids[0].toString() : undefined;
    if (!resolvedApp) {
      const runStr = chalk.cyan(`bit run <app id or name>`);
      this.logger.console(`multiple apps found, please specify one using "${runStr}"`);
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
        await open(url);
      }
    } else if (port) {
      // New API - also open browser when port is available
      const url = `http://localhost:${port}`;
      // this.logger.console(`${appName} app is running on ${url}`);

      if (!noBrowser) {
        await open(url);
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
