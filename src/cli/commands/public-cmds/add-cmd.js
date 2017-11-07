/** @flow */
import chalk from 'chalk';
import path from 'path';
import Command from '../../command';
import { add } from '../../../api/consumer';
import type { ComponentMapFile } from '../../../consumer/bit-map/component-map';
import { pathNormalizeToLinux } from '../../../utils';

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
    ['o', 'override <boolean>', 'override existing component if exists (default = false)']
  ];
  loader = true;
  migration = true;

  action(
    [paths]: [string[]],
    {
      id,
      main,
      tests,
      namespace,
      exclude,
      override
    }: {
      id: ?string,
      main: ?string,
      tests: ?(string[]),
      namespace: ?string,
      exclude: ?string,
      override: ?boolean
    }
  ): Promise<*> {
    if (namespace && id) {
      return Promise.reject('You can use either [id] or [namespace] to add a particular component');
    }

    const normalizedPathes = paths.map(p => path.normalize(p));
    const testsArray = tests ? this.splitList(tests).map(filePath => path.normalize(filePath.trim())) : [];
    const exludedFiles = exclude
      ? this.splitList(exclude).map(filePath => pathNormalizeToLinux(filePath.trim()))
      : undefined;
    return add(
      normalizedPathes,
      id,
      main ? path.normalize(main) : undefined,
      namespace,
      testsArray,
      exludedFiles,
      override || false
    );
  }

  report(results: Array<{ id: string, files: ComponentMapFile[] }>): string {
    if (results.length > 1) {
      return chalk.green(`tracking ${results.length} new components`);
    }

    return results
      .map((result) => {
        if (result.files.length === 0) {
          return chalk.underline.red(`could not track component ${chalk.bold(result.id)}: no files to track`);
        }
        const title = chalk.underline(`tracking component ${chalk.bold(result.id)}:\n`);
        const files = result.files.map(file => chalk.green(`added ${file.relativePath}`));
        return title + files.join('\n');
      })
      .join('\n\n');
  }
}
