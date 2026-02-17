import { BitError } from '@teambit/bit-error';
import type { Command, CommandOptions } from '@teambit/cli';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy.constants';
import type { Logger } from '@teambit/logger';
import open from 'open';
import chalk from 'chalk';
import type { UiMain } from './ui.main.runtime';

type StartArgs = [userPattern: string];
type StartFlags = {
  dev: boolean;
  port: string;
  rebuild: boolean;
  verbose: boolean;
  showInternalUrls: boolean;
  noBrowser: boolean;
  skipCompilation: boolean;
  skipUiBuild: boolean;
  uiRootName: string;
};

export class StartCmd implements Command {
  name = 'start [component-pattern]';
  description = 'launch the Bit development server';
  extendedDescription = `starts the local development server providing a UI to browse, preview, and interact with components.
works in both workspaces and scopes. opens automatically in your browser at http://localhost:3000 (or specified port).
includes hot module reloading for development.`;
  arguments = [
    {
      name: 'component-pattern',
      description: COMPONENT_PATTERN_HELP,
    },
  ];
  alias = 'c';
  group = 'run-serve';
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
    ['', 'show-internal-urls', 'show urls for all internal dev servers'],
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
      showInternalUrls,
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
      showInternalUrls,
    });

    uiServer
      .then(async (server) => {
        const url = this.ui.publicUrl || server.fullUrl;
        spinnies.succeed('ui-server', { text: `UI server ready ${chalk.dim('\u2192')} ${chalk.cyan(url)}` });
        if (!server.buildOptions?.launchBrowserOnStart) return undefined;

        await server.whenReady;
        const name = server.getName();
        const message = chalk.green(`\nView '${chalk.bold(name)}' components at ${chalk.cyan(url)}`);
        spinnies.add('summary', { text: message, status: 'non-spinnable' });
        if (!noBrowser) {
          await open(url);
        }
        return undefined;
      })
      .catch((error) => {
        this.logger.error(`failed to start the UI server`, error);
        // spinnies.fail('ui-server', { text: `failed to start the UI server. ${error.message}` });
        throw new Error(
          'failed to start the UI server, please try running the command with --log flag, or check bit debug.log file (see its location by running bit globals)'
        );
      });

    // DO NOT CHANGE THIS - this meant to be an async hook.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.ui.invokeOnStart();
    this.ui.clearConsole();
  }
}
