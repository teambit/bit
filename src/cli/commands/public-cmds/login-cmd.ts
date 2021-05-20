import chalk from 'chalk';

import { login } from '../../../api/consumer';
import { BASE_WEB_DOMAIN } from '../../../constants';
import { Group } from '../../command-groups';
import { CommandOptions, LegacyCommand } from '../../legacy-command';

export default class Login implements LegacyCommand {
  name = 'login';
  description = 'log the CLI into Bit';
  group: Group = 'general';
  alias = '';
  skipWorkspace = true;
  opts = [
    ['p', 'port <port>', 'port number to open for localhost server (default 8085)'],
    ['', 'suppress-browser-launch', 'do not open a browser for authentication'],
    ['', 'npmrc-path <path>', `path to npmrc file to configure ${BASE_WEB_DOMAIN} registry`],
    ['', 'skip-registry-config [boolean]', `don't configure ${BASE_WEB_DOMAIN} registry`],
    [
      '',
      'machine-name <string>',
      'specify machine-name to pair with the token (useful for CI to avoid accidentally revoke the token)',
    ],
  ] as CommandOptions;
  action(
    [], // eslint-disable-line no-empty-pattern
    {
      port,
      suppressBrowserLaunch = false,
      npmrcPath,
      skipRegistryConfig = false,
      machineName,
    }: {
      port: string;
      suppressBrowserLaunch?: boolean;
      npmrcPath: string;
      skipRegistryConfig: boolean;
      machineName?: string;
    }
  ): Promise<any> {
    return login(port, suppressBrowserLaunch, npmrcPath, skipRegistryConfig, machineName).then((results) => ({
      ...results,
      skipRegistryConfig,
    }));
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
