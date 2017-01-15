/** @flow */
import Command from '../command';
import { exportAction } from '../../api';

export default class Push extends Command {
  name = 'export <id> <remote>';
  description = 'export local scope refs to a remote scope.';
  alias = 'e';
  opts = [
    ['i', 'identity-file', 'path to identity file']
  ];
  
  action([id, remote]: [string, string]): Promise<*> {
    return exportAction(id, remote).then(() => ({ id, remote }));
  }

  report({ id, remote }: { id: string, remote: string }): string {
    return `component ${id} pushed succesfully to scope ${remote}`;
  }
}
