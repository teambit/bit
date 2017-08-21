/** @flow */
import chalk from 'chalk';
import path from 'path';
import Command from '../../command';
import { add } from '../../../api/consumer';

export default class Add extends Command {
  name = 'add <path...>';
  description = 'add any subset of files to be tracked as a component(s)';
  alias = 'a';
  opts = [
    ['i', 'id <name>', 'component id, if not specified the name will be '],
    ['m', 'main <file>', 'implementation/index file name'],
    ['t', 'tests <file...>', 'spec/test file name or dsl (tests/{PARENT_FOLDER}/{FILE_NAME})'],
    ['n', 'namespace <namespace>', 'component namespace'],
    ['e', 'exclude <file...>', 'exclude file name'],
  ];
  loader = true;

  action([paths]: [string[]], { id, main, tests, namespace, exclude }: {
    id: ?string,
    main: ?string,
    tests: ?string[],
    namespace:?string,
    exclude:?string,
  }): Promise<*> {
    if (namespace && id) {
      return Promise.reject('You can use either [id] or [namespace] to add a particular component');
    }

    const normalizedPathes = paths.map(p => path.normalize(p));
    const testsArray = tests ? this.splitList(tests).map(filePath => path.normalize(filePath.trim())) : [];
    const exludedFiles = exclude ? this.splitList(exclude).map(filePath => path.normalize(filePath.trim())) : undefined;
    return add(normalizedPathes, id, (main) ? path.normalize(main): undefined, namespace, testsArray, exludedFiles);
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
