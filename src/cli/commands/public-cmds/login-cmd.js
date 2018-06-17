/** @flow */
import chalk from 'chalk';
import Command from '../../command';
import { login } from '../../../api/consumer';

export default class Login extends Command {
  name = 'login';
  description = 'log the CLI into Bit';
  alias = '';
  opts = [
    ['p', 'port <port>', 'port number to open for localhost server (default 8085)'],
    ['', 'suppress-browser-launch', 'do not open a browser for authentication'],
    ['', 'npmrc-path <path>', 'path to npmrc file to configure bitsrc registry'],
    ['', 'skip-registry-config [boolean]', 'dont configure bitsrc registry']
  ];
  // $FlowFixMe
  action(
    [nothing]: [string[]],
    {
      port,
      suppressBrowserLaunch = false,
      npmrcPath,
      skipRegistryConfig = false
    }: { port: string, suppressBrowserLaunch?: boolean, npmrcPath: string, skipRegistryConfig: boolean }
  ): Promise<any> {
    return login(port, suppressBrowserLaunch, npmrcPath, skipRegistryConfig).then(
      ({ isAlreadyLoggedIn, username, npmrcPath, writeToNpmrcError }) => ({
        isAlreadyLoggedIn,
        username,
        npmrcPath,
        writeToNpmrcError,
        skipRegistryConfig
      })
    );
  }
  report({
    isAlreadyLoggedIn = false,
    username,
    npmrcPath,
    skipRegistryConfig,
    writeToNpmrcError
  }: {
    isAlreadyLoggedIn: boolean,
    username: string,
    npmrcPath: string,
    skipRegistryConfig: boolean,
    writeToNpmrcError: boolean
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
