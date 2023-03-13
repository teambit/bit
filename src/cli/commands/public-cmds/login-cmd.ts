import chalk from 'chalk';

import { login } from '../../../api/consumer';
import { getCloudDomain } from '../../../constants';
import { Group } from '../../command-groups';
import { CommandOptions, LegacyCommand } from '../../legacy-command';

export default class Login implements LegacyCommand {
  name = 'login';
  description = 'log in to Bit cloud';
  group: Group = 'general';
  alias = '';
  skipWorkspace = true;
  opts = [
    ['d', 'hub-domain-login <url>', 'hub domain login url (default https://bit.cloud)'],
    ['p', 'port <port>', 'port number to open for localhost server (default 8085)'],
    ['', 'suppress-browser-launch', 'do not open a browser for authentication'],
    ['', 'npmrc-path <path>', `path to npmrc file to configure ${getCloudDomain()} registry`],
    ['', 'skip-registry-config', `don't configure ${getCloudDomain()} registry`],
    [
      '',
      'machine-name <name>',
      'specify machine-name to pair with the token (useful for CI to avoid accidentally revoke the token)',
    ],
  ] as CommandOptions;
  action(
    [], // eslint-disable-line no-empty-pattern
    {
      hubDomainLogin,
      port,
      suppressBrowserLaunch = false,
      npmrcPath,
      skipRegistryConfig = false,
      machineName,
    }: {
      hubDomainLogin?: string;
      port: string;
      suppressBrowserLaunch?: boolean;
      npmrcPath: string;
      skipRegistryConfig: boolean;
      machineName?: string;
    }
  ): Promise<any> {
    return login(port, suppressBrowserLaunch, npmrcPath, skipRegistryConfig, machineName, hubDomainLogin).then(
      (results) => ({
        ...results,
        skipRegistryConfig,
      })
    );
  }
  report({
    isAlreadyLoggedIn = false,
    username,
    npmrcPath,
    skipRegistryConfig,
    writeToNpmrcError,
  }: {
    isAlreadyLoggedIn: boolean;
    username: string;
    npmrcPath: string;
    skipRegistryConfig: boolean;
    writeToNpmrcError: boolean;
  }): string {
    if (isAlreadyLoggedIn) return chalk.yellow('already logged in');
    const successLoginMessage = chalk.green(`success! logged in as ${username}`);
    let writeToNpmrcMessage = '\n';
    if (!skipRegistryConfig) {
      writeToNpmrcMessage = writeToNpmrcError
        ? chalk.yellow(`\nunable to add @bit as a scoped registry at "${chalk.bold(npmrcPath)}"\n`)
        : chalk.green(`\nsuccessfully added @bit as a scoped registry at ${npmrcPath}\n`);
    }
    const finalMessage = `${writeToNpmrcMessage}${successLoginMessage}`;
    return finalMessage;
  }
}
