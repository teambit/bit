/** @flow */
import Command from '../command';
import { push } from '../../api';

const chalk = require('chalk');

export default class Push extends Command {
  name = 'push <id> <remote>';
  description = 'pushed local scope refs to a remote scope.';
  alias = '';
  opts = [
    ['i', 'identity-file', 'path to identity file']
  ];
  
  action([id, remote]: [string, string]): Promise<*> {
    return push();
  }

  report(): string {
    return chalk.bgBlack('pushed');
  }
}
