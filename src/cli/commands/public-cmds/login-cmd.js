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
    ['', 'no-launch-browser', 'do not open a browser for authentication'],
    ['', 'npmrc-path <path>', 'path to npmrc file to configure bitsrc registry'],
    ['', 'skip-registry-config [boolean]', 'dont configure bitsrc registry']
  ];
  // $FlowFixMe
  action(
    [nothing]: [string[]],
    {
      port,
      noLaunchBrowser = false,
      npmrcPath,
      skipRegistryConfig = false
    }: { port: string, noLaunchBrowser?: boolean, npmrcPath: string, skipRegistryConfig: boolean }
  ): Promise<any> {
    return login(port, noLaunchBrowser, npmrcPath, skipRegistryConfig).then(
      ({ isAlreadyLoggedIn, username, npmrcPath }) => ({ isAlreadyLoggedIn, username, npmrcPath, skipRegistryConfig })
    );
  }
  report({
    isAlreadyLoggedIn = false,
    username,
    npmrcPath,
    skipRegistryConfig
  }: {
    isAlreadyLoggedIn: boolean,
    username: string,
    npmrcPath: string,
    skipRegistryConfig: boolean
  }): string {
    if (isAlreadyLoggedIn) return chalk.yellow('already logged in');
    return skipRegistryConfig
      ? chalk.green(`success! logged in as ${username}`)
      : chalk.green(`success! logged in as ${username}\nsuccessfully added @bit as a scoped registry at ${npmrcPath}`);
  }
}
