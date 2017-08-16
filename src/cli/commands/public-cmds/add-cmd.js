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
    ['t', 'tests <file...>', 'spec/test file name or dsl (tests/{PARENT_FOLDER}/{FILE_NAME})'],
    ['n', 'namespace <namespace>', 'component namespace'],
    ['e', 'exclude <file...>', 'exclude file name'],
  ];
  loader = true;

  action([path]: [string[]], { id, main, tests, namespace, exclude }: {
    id: ?string,
    main: ?string,
    tests: ?string[],
    namespace:?string,
    exclude:?string,
  }): Promise<*> {
    if (namespace && id) {
      return Promise.reject('You can use either [id] or [namespace] to add a particular component');
    }
    const testsArray = tests ? this.splitList(tests).map(filePath => filePath.trim()) : [];
    const exludedFiles = exclude ? this.splitList(exclude).map(filePath => filePath.trim()) : undefined;
    return add(path, id, main, namespace, testsArray, exludedFiles);
  }

  report(results: Array<{ id: string, files: string[] }>): string {
    if (results.length > 1) {
      return chalk.green(`tracking ${results.length} new components`);
    }

    return results.map((result) => {
      if (result.files.length === 0) {
        return chalk.underline.red(`could not track component ${chalk.bold(result.id)}: no files to track`);
      }
      const title = chalk.underline(`tracking component ${chalk.bold(result.id)}:\n`);
      const files = result.files.map(file => chalk.green(`added ${file.relativePath}`));
      return title + files.join('\n');
    }).join('\n\n');
  }
}
