/** @flow */
import R from 'ramda';
import Command from '../../command';
import { exportAction } from '../../../api/consumer';
import { BitId } from '../../../bit-id';

const chalk = require('chalk');

export default class Export extends Command {
  name = 'export <remote> [id...]';
  description = 'export components to a remote scope.';
  alias = 'e';
  opts = [['f', 'forget', 'do not save to bit.json after export']];
  loader = true;

  action([remote, ids]: [string, string[]], { forget }: any): Promise<*> {
    return exportAction(ids, remote, !forget).then(id => ({ id, remote }));
  }

  report({ componentId, remote }: { componentId: BitId | BitId[], remote: string }): string {
    if (R.isEmpty(componentId)) return chalk.green(`no components to export to scope ${chalk.bold(remote)}`);
    if (Array.isArray(componentId)) {
      return chalk.green(`exported ${componentId.length} components to scope ${chalk.bold(remote)}`);
    }

    return chalk.green(`exported component ${chalk.bold(componentId.toString())} to scope ${chalk.bold(remote)}`);
  }
}
