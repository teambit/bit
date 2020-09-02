import chalk from 'chalk';

import * as scopeConfig from '../../../api/consumer/lib/global-config';
import { CFG_USER_TOKEN_KEY } from '../../../constants';
import { LegacyCommand } from '../../legacy-command';

export default class Logout implements LegacyCommand {
  name = 'logout';
  description = 'log the CLI out of Bit';
  alias = '';
  opts = [];

  action(): Promise<any> {
    scopeConfig.delSync(CFG_USER_TOKEN_KEY);
    return Promise.resolve();
  }

  report(): string {
    return chalk.green('logged out successfully.');
  }
}
