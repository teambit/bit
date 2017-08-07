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
      const header = `The following components were pushed successfully to scope ${remote}\n`;
      const componentsList = component.map(c => c.id.toString()).join('\n');
      return chalk.underline(header) + chalk.green(componentsList);
    }
    return chalk.green(`component ${component.id.toString()} pushed successfully to scope ${remote}`);
  }
}
