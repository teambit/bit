import chalk from 'chalk';
import { Command, CommandOptions } from '@teambit/cli';
import { CloudMain } from './cloud.main.runtime';

export class LoginCmd implements Command {
  name = 'login';
  description = 'log in to Bit cloud';
  group = 'general';
  alias = '';
  skipWorkspace = true;
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

  constructor(private cloud: CloudMain) {}

  async report(
    [],
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
    const result = await this.cloud.login(port, noBrowser, machineName, cloudDomain, true);
    if (result?.isAlreadyLoggedIn) {
      return chalk.yellow(`already logged in as ${result?.username}`);
    }
    return chalk.green(`success! logged in as ${result?.username}`);
  }
}
