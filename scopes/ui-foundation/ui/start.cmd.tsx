import { BitError } from '@teambit/bit-error';
import { Command, CommandOptions } from '@teambit/cli';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy/dist/constants';
import { Logger } from '@teambit/logger';
import openBrowser from 'react-dev-utils/openBrowser';
import chalk from 'chalk';
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
    [
      'r',
      'rebuild',
      'rebuild the UI (useful e.g. when updating the workspace UI - can use the dev flag for HMR in this case)',
    ],
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

  async wait(
    [userPattern]: StartArgs,
    {
      dev,
      port,
      rebuild,
      verbose,
      noBrowser,
      skipCompilation,
      skipUiBuild,
      uiRootName: uiRootAspectIdOrName,
    }: StartFlags
  ) {
    const spinnies = this.logger.multiSpinner;

    if (!this.ui.isHostAvailable()) {
      throw new BitError(
        `bit start can only be run inside a bit workspace or a bit scope - please ensure you are running the command in the correct directory`
      );
    }
    const appName = this.ui.getUiName(uiRootAspectIdOrName);
    await this.ui.invokePreStart({ skipCompilation });
    this.logger.off();
    spinnies.add('ui-server', { text: `Starting UI server for ${appName}` });

    const uiServer = this.ui.createRuntime({
      uiRootAspectIdOrName,
      skipUiBuild,
      pattern: userPattern,
      dev,
      port: +port,
      rebuild,
      verbose,
    });

    uiServer
      .then(async (server) => {
        const url = this.ui.publicUrl || server.fullUrl;
        spinnies.succeed('ui-server', { text: `UI server is ready at ${chalk.cyan(url)}` });
        if (!server.buildOptions?.launchBrowserOnStart) return undefined;

        await server.whenReady;
        const name = server.getName();
        const message = chalk.green(`You can now view '${chalk.cyan(name)}' components in the browser.
Bit server is running on ${chalk.cyan(url)}`);
        spinnies.add('summary', { text: message, status: 'non-spinnable' });
        if (!noBrowser) {
          openBrowser(url);
        }
        return undefined;
      })
      .catch((error) => this.logger.error(error));

    // DO NOT CHANGE THIS - this meant to be an async hook.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.ui.invokeOnStart();
    this.ui.clearConsole();
  }
}
