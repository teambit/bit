import chalk from 'chalk';
import yesno from 'yesno';
import { Command, CommandOptions } from '@teambit/cli';
import { isEmpty } from 'lodash';
import { CloudMain } from './cloud.main.runtime';

export class LoginCmd implements Command {
  name = 'login';
  description = 'log in to Bit cloud';
  group = 'general';
  alias = '';
  options = [
    ['', 'skip-config-update', 'skip writing to the .npmrc file'],
    ['', 'refresh-token', 'force refresh token even when logged in'],
    ['d', 'cloud-domain <domain>', 'login cloud domain (default bit.cloud)'],
    ['p', 'port <port>', 'port number to open for localhost server (default 8085)'],
    ['', 'no-browser', 'do not open a browser for authentication'],
    [
      '',
      'machine-name <name>',
      'specify machine-name to pair with the token (useful for CI to avoid accidentally revoking the token)',
    ],
    ['', 'suppress-browser-launch', 'DEPRECATE. use --no-browser instead'],
  ] as CommandOptions;
  loader = true;
  remoteOp = true;
  skipWorkspace = true;
  loadAspects = false;

  private port?: string;

  constructor(private cloud: CloudMain, _port?: number) {
    this.port = _port?.toString();
  }

  async report(
    [], // eslint-disable-line no-empty-pattern
    {
      cloudDomain,
      port,
      suppressBrowserLaunch,
      noBrowser,
      machineName,
      skipConfigUpdate,
      refreshToken,
    }: {
      cloudDomain?: string;
      port: string;
      suppressBrowserLaunch?: boolean;
      noBrowser?: boolean;
      machineName?: string;
      skipConfigUpdate?: boolean;
      refreshToken?: boolean;
    }
  ): Promise<string> {
    noBrowser = noBrowser || suppressBrowserLaunch;

    if (refreshToken) {
      this.cloud.logout();
    }

    const isLoggedIn = this.cloud.isLoggedIn();

    if (isLoggedIn) {
      this.cloud.logger.clearStatusLine();
      const reLoginPrompt = chalk.yellow(
        'You are already logged in. Do you want to re-login to refresh your access token? [yes(y)/no(n)]'
      );
      const ok = await yesno({ question: reLoginPrompt });
      if (!ok) {
        return chalk.green(`Logged in as ${this.cloud.getUsername()}`);
      }
      this.cloud.logout();
    }

    const result = await this.cloud.login(
      port || this.port,
      noBrowser,
      machineName,
      cloudDomain,
      undefined,
      skipConfigUpdate
    );

    let message = chalk.green(`Logged in as ${result?.username}`);

    if (skipConfigUpdate) {
      return message;
    }

    const conflicts = result?.npmrcUpdateResult?.conflicts;
    if (conflicts && conflicts.length > 0) {
      message += await this.handleNpmrcConflicts(conflicts);
    } else {
      message += this.getNpmrcUpdateMessage(result?.npmrcUpdateResult?.error);
    }

    message = this.getGlobalConfigUpdatesMessage(result?.globalConfigUpdates) + message;

    return message;
  }

  async json(
    [], // eslint-disable-line no-empty-pattern,
    {
      cloudDomain,
      port,
      suppressBrowserLaunch,
      noBrowser,
      machineName,
      skipConfigUpdate,
    }: {
      cloudDomain?: string;
      port: string;
      suppressBrowserLaunch?: boolean;
      noBrowser?: boolean;
      machineName?: string;
      skipConfigUpdate?: boolean;
    }
  ): Promise<{
    username?: string;
    token?: string;
    successfullyUpdatedNpmrc?: boolean;
    globalConfigUpdates?: Record<string, string | undefined>;
  }> {
    if (suppressBrowserLaunch) {
      noBrowser = true;
    }
    const result = await this.cloud.login(port, noBrowser, machineName, cloudDomain, undefined, skipConfigUpdate);
    return {
      username: result?.username,
      token: result?.token,
      successfullyUpdatedNpmrc: !!result?.npmrcUpdateResult?.configUpdates,
      globalConfigUpdates: result?.globalConfigUpdates,
    };
  }

  async handleNpmrcConflicts(conflicts): Promise<string> {
    this.cloud.logger.clearStatusLine();
    const conflictDetails = conflicts
      .map(
        (conflict, index) =>
          `${chalk.yellow(`Conflict #${index + 1}:`)}
Original: ${chalk.red(conflict.original)}
Modification: ${chalk.green(conflict.modifications)}`
      )
      .join('\n\n');

    const question = `\n${chalk.yellow(
      'Conflict detected in .npmrc file with the following configurations:'
    )}\n${conflictDetails}\n${chalk.yellow(
      'Do you want to override these configurations and continue? [yes(y)/no(n)]'
    )}`;

    const ok = await yesno({ question });
    if (!ok) {
      return chalk.red(' but updating .npmrc was aborted due to conflicts.');
    }

    try {
      await this.cloud.generateNpmrc({ force: true });
      return chalk.green(' and .npmrc updated successfully after resolving conflicts.');
    } catch (e) {
      return `${chalk.red(' but failed to update .npmrc after resolving conflicts.')} Visit ${chalk.bold(
        'https://bit.dev/reference/packages/npmrc'
      )} for instructions on how to update it manually.`;
    }
  }

  getNpmrcUpdateMessage(error): string {
    if (!error) {
      return chalk.green(' and .npmrc updated.');
    }
    return chalk.red(
      ` but failed to update .npmrc. Visit ${chalk.bold(
        'https://bit.dev/reference/packages/npmrc'
      )} for instructions on how to update it manually.`
    );
  }

  getGlobalConfigUpdatesMessage = (globalConfigUpdates: Record<string, string | undefined> | undefined): string => {
    if (!globalConfigUpdates || isEmpty(globalConfigUpdates)) return '';
    const updates = Object.entries(globalConfigUpdates)
      .map(([key, value]) => {
        const label = value === '' ? 'removed' : 'updated';
        return `${key}: ${value} (${label})`;
      })
      .join('\n');
    return chalk.greenBright(`\nGlobal config updated:\n${updates}\n\n`);
  };
}
