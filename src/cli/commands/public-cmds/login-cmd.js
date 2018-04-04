/** @flow */
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

  report(data: { string: any }): string {
    return '';
  }
}
