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
    ['', 'no-launch-browser', 'do not open a browser for authentication']
  ];
  // $FlowFixMe
  action(
    [nothing]: [string[]],
    { port, noLaunchBrowser = false }: { port: string, noLaunchBrowser?: boolean }
  ): Promise<any> {
    return login(port, noLaunchBrowser);
  }
  report({ isAlreadyLoggedIn = false, username }: { isAlreadyLoggedIn: boolean, username: string }): string {
    if (isAlreadyLoggedIn) return chalk.yellow('already logged in');
    return chalk.green(`success! logged in as ${username}`);
  }
}
