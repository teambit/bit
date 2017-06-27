/** @flow */
import chalk from 'chalk';
import Command from '../../command';
import { add } from '../../../api/consumer';

export default class Add extends Command {
  name = 'add <path...>';
  description = 'Track a new component (add to bit.lock file)';
  alias = 'a';
  opts = [
    ['id', 'id <name>', 'component id, if not specified the name will be '],
    ['i', 'index <file>', 'implementation/index file name'],
    ['s', 'spec <file>', 'spec/test file name'],
  ];
  loader = true;

  action([path]: [string], { id, index, spec }: {
    id: ?string,
    index: ?string,
    spec: ?string,
  }): Promise<*> {
    return add(path, id, index, spec);
  }

  report(result: Object): string {
    return chalk.green(`${result.added} has been added to bit.lock`);
  }
}
