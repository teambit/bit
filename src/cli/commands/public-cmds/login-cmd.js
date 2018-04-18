/** @flow */
import chalk from 'chalk';
import Command from '../../command';
import { login } from '../../../api/consumer';

export default class Login extends Command {
  name = 'login';
  description = 'login to bitsrc';
  alias = '';
  opts = [];

  action(): Promise<any> {
    return login();
  }
  report({ isAlreadyLoggedIn = false, username }: { isAlreadyLoggedIn: boolean, username: string }): string {
    if (isAlreadyLoggedIn) return chalk.yellow('Already logged in');
    return chalk.green(`success! logged in as ${username}`);
  }
}
