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

  constructor(private cloud: CloudMain) {}

  async report(
    [], // eslint-disable-line no-empty-pattern
    {
      cloudDomain,
      port = '8889',
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
    const result = await this.cloud.login(port, noBrowser, machineName, cloudDomain, undefined);
    if (result?.isAlreadyLoggedIn) {
      return chalk.yellow(`already logged in as ${result?.username}`);
    }
    return chalk.green(`success! logged in as ${result?.username}`);
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
  ): Promise<{ username?: string; token?: string }> {
    if (suppressBrowserLaunch) {
      noBrowser = true;
    }
    const result = await this.cloud.login(port, noBrowser, machineName, cloudDomain);
    return { username: result?.username, token: result?.token };
  }
}
