/** @flow */
import Command from '../../command';
import { exportAction } from '../../../api/consumer';

const chalk = require('chalk');

export default class Export extends Command {
  name = 'export <id> <remote>';
  description = 'export local scope refs to a remote scope.';
  alias = 'e';
  opts = [
    ['s', 'save', 'save into bit.json']
  ];
  loader = true;
  
  action([id, remote]: [string, string], { save }: any): Promise<*> {
    return exportAction(id, remote, save).then(() => ({ id, remote }));
  }

  report({ id, remote }: { id: string, remote: string }): string {
    return chalk.green(`component ${id} pushed succesfully to scope ${remote}`);
  }
}
