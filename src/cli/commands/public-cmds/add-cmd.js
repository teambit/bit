/** @flow */
import chalk from 'chalk';
import Command from '../../command';
import { add } from '../../../api/consumer';

export default class Add extends Command {
  name = 'add <path...>';
  description = 'Track a new component (add to bit.map file)';
  alias = 'a';
  opts = [
    ['id', 'id <name>', 'component id, if not specified the name will be '],
    ['i', 'index <file>', 'implementation/index file name'],
    ['s', 'specs <file...>', 'spec/test file name'],
  ];
  loader = true;

  action([path]: [string[]], { id, index, specs }: {
    id: ?string,
    index: ?string,
    specs: ?string[],
  }): Promise<*> {
    // todo: the specs parameter should be an array, it is currently a string
    const specsArray = specs ? [specs] : [];
    return add(path, id, index, specsArray);
  }

  report(results: Array<{ id: string, files: string[] }>): string {
    return results.map(result => {
      const title = chalk.underline(`Tracking component ${chalk.bold(result.id)}:\n`);
      const files = Object.keys(result.files).map(file => chalk.green(`added ${file} => ${result.files[file].path}`));
      return title + files.join('\n');
    }).join('\n\n');
  }
}
