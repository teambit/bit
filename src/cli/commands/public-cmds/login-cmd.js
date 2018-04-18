/** @flow */
import chalk from 'chalk';
import Command from '../../command';
import { login } from '../../../api/consumer';

export default class Login extends Command {
  name = 'login';
  description = 'login to bitsrc';
  alias = '';
  opts = [['p', 'port <port>', 'port number to listen on when running bit login(default 8085)']];
  // $FlowFixMe
  action([nothing]: [string[]], { port }: { port: string }): Promise<any> {
    return login(port);
  }
  report({ isAlreadyLoggedIn = false, username }: { isAlreadyLoggedIn: boolean, username: string }): string {
    if (isAlreadyLoggedIn) return chalk.yellow(`already logged in as ${username}`);
    return chalk.green(`success! logged in as ${username}`);
  }
}
