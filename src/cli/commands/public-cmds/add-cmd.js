/** @flow */
import chalk from 'chalk';
import Command from '../../command';
import { add } from '../../../api/consumer';

export default class Add extends Command {
  name = 'add <path...>';
  description = 'Track a new component (add to bit.map file)';
  alias = 'a';
  opts = [
    ['i', 'id <name>', 'component id, if not specified the name will be '],
    ['m', 'main <file>', 'implementation/index file name'],
    ['t', 'tests <file...>', 'spec/test file name'],
    ['n', 'namespace <namespace>', 'component namespace']
  ];
  loader = true;

  action([path]: [string[]], { id, main, tests, namespace }: {
    id: ?string,
    main: ?string,
    tests: ?string[],
    namespace:?string
  }): Promise<*> {
    // todo: the specs parameter should be an array, it is currently a string
    if (namespace && id) {
      return Promise.reject('You can use either [id] or [namespace] to add a particular component');
    }
    const testsArray = tests ? [tests] : [];
    return add(path, id, main, namespace, testsArray);
  }

  report(results: Array<{ id: string, files: string[] }>): string {
    return results.map(result => {
      const title = chalk.underline(`Tracking component ${chalk.bold(result.id)}:\n`);
      const files = Object.keys(result.files).map(file => chalk.green(`added ${result.files[file]}`));
      return title + files.join('\n');
    }).join('\n\n');
  }
}
