import chalk from 'chalk';

import { login } from '../../../api/consumer';
import { Group } from '../../command-groups';
import { CommandOptions, LegacyCommand } from '../../legacy-command';

export default class Login implements LegacyCommand {
  name = 'login';
  description = 'log in to Bit cloud';
  group: Group = 'general';
  alias = '';
  skipWorkspace = true;
  opts = [
    ['d', 'cloud-domain <domain>', 'login cloud domain (default bit.cloud)'],
    ['p', 'port <port>', 'port number to open for localhost server (default 8085)'],
    ['', 'suppress-browser-launch', 'do not open a browser for authentication'],
    [
      '',
      'machine-name <name>',
      'specify machine-name to pair with the token (useful for CI to avoid accidentally revoking the token)',
    ],
  ] as CommandOptions;
  action(
    [], // eslint-disable-line no-empty-pattern
    {
      cloudDomain,
      port,
      suppressBrowserLaunch = false,
      machineName,
    }: {
      cloudDomain?: string;
      port: string;
      suppressBrowserLaunch?: boolean;
      machineName?: string;
    }
  ): Promise<any> {
    return login(port, suppressBrowserLaunch, machineName, cloudDomain).then((results) => ({
      ...results,
    }));
  }
  report({
    isAlreadyLoggedIn = false,
    username,
  }: {
    isAlreadyLoggedIn: boolean;
    username: string;
    writeToNpmrcError: boolean;
  }): string {
    if (isAlreadyLoggedIn) return chalk.yellow('already logged in');
    const successLoginMessage = chalk.green(`success! logged in as ${username}`);
    const finalMessage = successLoginMessage;
    return finalMessage;
  }
}
