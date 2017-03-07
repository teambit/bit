/** @flow */
import Command from '../../command';
import { exportAction } from '../../../api/consumer';

const chalk = require('chalk');

export default class Export extends Command {
  name = 'export <id> <remote>';
  description = 'export local scope refs to a remote scope.';
  alias = 'e';
  opts = [
    ['f', 'forget', 'do not save to bit.json after export']
  ];
  loader = true;

  action([id, remote]: [string, string], { forget }: any): Promise<*> {
    return exportAction(id, remote, !forget).then(() => ({ id, remote }));
  }

  report({ id, remote }: { id: string, remote: string }): string {
    return chalk.green(`component ${id} pushed succesfully to scope ${remote}`);
  }
}
