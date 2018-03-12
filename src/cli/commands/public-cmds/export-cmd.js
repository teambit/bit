/** @flow */
import R from 'ramda';
import Command from '../../command';
import { exportAction } from '../../../api/consumer';
import { BitId } from '../../../bit-id';

const chalk = require('chalk');

export default class Export extends Command {
  name = 'export <remote> [id...]';
  description = 'export components to a remote scope.\n  https://docs.bitsrc.io/docs/organizing-components-in-scopes.html';
  alias = 'e';
  opts = [
    ['f', 'forget', 'do not save to bit.json after export'],
    ['e', 'eject', 'once the export is done, remove the exported components locally and install them by the NPM client']
  ];
  loader = true;
  migration = true;

  action([remote, ids]: [string, string[]], { forget, eject }: any): Promise<*> {
    return exportAction(ids, remote, !forget, eject).then(componentId => ({ componentId, remote }));
  }

  report({ componentId, remote }: { componentId: BitId | BitId[], remote: string }): string {
    if (R.isEmpty(componentId)) return chalk.green('nothing to export');
    if (Array.isArray(componentId)) {
      return chalk.green(`exported ${componentId.length} components to scope ${chalk.bold(remote)}`);
    }

    return chalk.green(`exported component ${chalk.bold(componentId.toString())} to scope ${chalk.bold(remote)}`);
  }
}
