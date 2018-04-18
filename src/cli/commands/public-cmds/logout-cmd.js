/** @flow */
import chalk from 'chalk';
import Command from '../../command';
import { CFG_BITSRC_TOKEN_KEY, CFG_BITSRC_USERNAME_KEY } from '../../../constants';
import * as scopeConfig from '../../../api/consumer/lib/global-config';

export default class Logout extends Command {
  name = 'logout';
  description = 'logout from bit';
  alias = '';
  opts = [];

  action(): Promise<any> {
    scopeConfig.delSync(CFG_BITSRC_TOKEN_KEY);
    scopeConfig.delSync(CFG_BITSRC_USERNAME_KEY);
    return Promise.resolve();
  }

  report(): string {
    return chalk.green('logged out successfully.');
  }
}
