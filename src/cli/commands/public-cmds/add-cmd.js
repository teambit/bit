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
    ['n', 'namespace <namespace>', 'component namespace'],
    ['e', 'exclude <file...>', 'exclude file name'],
  ];
  loader = true;

  action([path]: [string[]], { id, main, tests, namespace, exclude }: {
    id: ?string,
    main: ?string,
    tests: ?string[],
    namespace:?string,
    exclude:?String
  }): Promise<*> {
    if (namespace && id) {
      return Promise.reject('You can use either [id] or [namespace] to add a particular component');
    }
    const testsArray = tests ? [tests] : [];
    const exludedFiles = exclude ? this.splitList(exclude): undefined ;
    return add(path, id, main, namespace, testsArray, exludedFiles);
  }

  report(results: Array<{ id: string, files: string[] }>): string {
    return results.map(result => {
      if (result.files.length === 0) {
        const title = chalk.underline.red(`Not Tracking component ${chalk.bold(result.id)}: No files to track!!!`);
        return title;
      } else{
        const title = chalk.underline(`Tracking component ${chalk.bold(result.id)}:\n`);
        const files = result.files.map(file => chalk.green(`added ${file.relativePath}`));
        return title + files.join('\n');
      }

    }).join('\n\n');
  }
}
