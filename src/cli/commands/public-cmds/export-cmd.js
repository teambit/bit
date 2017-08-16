/** @flow */
import Command from '../../command';
import { exportAction } from '../../../api/consumer';
import Component from '../../../consumer/component/consumer-component';

const chalk = require('chalk');

export default class Export extends Command {
  name = 'export <remote> [id...]';
  description = 'export local scope refs to a remote scope.';
  alias = 'e';
  opts = [
    ['f', 'forget', 'do not save to bit.json after export']
  ];
  loader = true;

  action([remote, ids]: [string, string[]], { forget }: any): Promise<*> {
    return exportAction(ids, remote, !forget).then(component => ({ component, remote }));
  }

  report({ component, remote }: { component: Component|Component[], remote: string }): string {
    if (Array.isArray(component)) {
      return chalk.green(`exported ${component.length} components to scope ${chalk.bold(remote)}`);
    }

    return chalk.green(`exported component ${chalk.bold(component.id.toString())} to scope ${chalk.bold(remote)}`);
  }
}
