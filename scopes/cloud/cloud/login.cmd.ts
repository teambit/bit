import chalk from 'chalk';
import { Command, CommandOptions } from '@teambit/cli';
import { CloudMain } from './cloud.main.runtime';

export class LoginCmd implements Command {
  name = 'login';
  description = 'log in to Bit cloud';
  group = 'general';
  alias = '';
  options = [
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
    }: {
      cloudDomain?: string;
      port: string;
      suppressBrowserLaunch?: boolean;
      noBrowser?: boolean;
      machineName?: string;
    }
  ): Promise<string> {
    if (suppressBrowserLaunch) {
      noBrowser = true;
    }
    const result = await this.cloud.login(port || this.port, noBrowser, machineName, cloudDomain, undefined);
    if (result?.isAlreadyLoggedIn) {
      return chalk.yellow(`already logged in as ${result?.username}`);
    }
    const npmrcUpdateResultMsg = result?.npmrcUpdateResult?.success
      ? ' and .npmrc updated'
      : chalk.red(
          ` but failed to update .npmrc. Visit https://bit.dev/reference/packages/npmrc for instructions on how to update it manually`
        );
    return chalk.green(`success! logged in as ${result?.username}${npmrcUpdateResultMsg}`);
  }

  async json(
    [], // eslint-disable-line no-empty-pattern,
    {
      cloudDomain,
      port,
      suppressBrowserLaunch,
      noBrowser,
      machineName,
    }: {
      cloudDomain?: string;
      port: string;
      suppressBrowserLaunch?: boolean;
      noBrowser?: boolean;
      machineName?: string;
    }
  ): Promise<{ username?: string; token?: string; successfullyUpdatedNpmrc?: boolean }> {
    if (suppressBrowserLaunch) {
      noBrowser = true;
    }
    const result = await this.cloud.login(port, noBrowser, machineName, cloudDomain);
    return {
      username: result?.username,
      token: result?.token,
      successfullyUpdatedNpmrc: result?.npmrcUpdateResult?.success,
    };
  }
}
