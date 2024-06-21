import { Command, CommandOptions } from '@teambit/cli';
import { Logger } from '@teambit/logger';
import { ApplicationMain } from './application.main.runtime';

type RunOptions = {
  dev: boolean;
  verbose: boolean;
  skipWatch: boolean;
  watch: boolean;
  ssr: boolean;
  port: string;
};

export class RunCmd implements Command {
  name = 'run <app-name>';
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
  group = 'apps';
  options = [
    ['d', 'dev', 'start the application in dev mode.'],
    ['p', 'port [port-number]', 'port to run the app on'],
    ['v', 'verbose', 'show verbose output for inspection and print stack trace'],
    // ['', 'skip-watch', 'avoid running the watch process that compiles components in the background'],
    ['w', 'watch', 'watch and compile your components upon changes'],
  ] as CommandOptions;

  constructor(
    /**
     * access to the extension instance.
     */
    private application: ApplicationMain,

    private logger: Logger
  ) {}

  async wait([appName]: [string], { dev, watch, ssr, port: exactPort }: RunOptions) {
    await this.application.loadAllAppsAsAspects();
    // remove wds logs until refactoring webpack to a worker through the Worker aspect.
    this.logger.off();
    const { port, errors, isOldApi } = await this.application.runApp(appName, {
      dev,
      watch,
      ssr,
      port: +exactPort,
    });

    if (errors) {
      const errStr =
        errors && errors.length ? errors.map((err) => err.toString()).join('\n') : 'unknown error occurred';
      this.logger.console(errStr);
      process.exit(1);
    }

    if (isOldApi) {
      this.logger.console(`${appName} app is running on http://localhost:${port}`);
    }
  }
}
