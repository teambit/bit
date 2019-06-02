/** @flow */
import chalk from 'chalk';
import path from 'path';
import R from 'ramda';
import Command from '../../command';
import { add } from '../../../api/consumer';
import type {
  AddActionResults,
  AddResult,
  PathOrDSL
} from '../../../consumer/component-ops/add-components/add-components';
import AddTestsWithoutId from '../exceptions/add-tests-without-id';
import type { PathOsBased } from '../../../utils/path';
import { BASE_DOCS_DOMAIN } from '../../../constants';
import GeneralError from '../../../error/general-error';

export default class Add extends Command {
  name = 'add [path...]';
  description = `add any subset of files to be tracked as a component(s)
  all flags support glob patterns and {PARENT} {FILE_NAME} annotations
  https://${BASE_DOCS_DOMAIN}/docs/cli-add.html
  https://${BASE_DOCS_DOMAIN}/docs/add-and-isolate-components.html
  https://${BASE_DOCS_DOMAIN}/docs/manage-component-files.html`;
  alias = 'a';
  opts = [
    ['i', 'id <name>', 'manually set component id'],
    ['m', 'main <file>', 'define entry point for the components'],
    [
      't',
      'tests <file>/"<file>,<file>"',
      'specify test files to track. use quotation marks to list files or use a glob pattern'
    ],
    ['n', 'namespace <namespace>', 'orginize component in a namespace'],
    [
      'e',
      'exclude <file>/"<file>,<file>"',
      'exclude file from being tracked. use quotation marks to list files or use a glob pattern'
    ],
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
      override = false
    }: {
      id: ?string,
      main: ?string,
      tests: ?(string[]),
      namespace: ?string,
      exclude: ?(string[]),
      override: boolean
    }
  ): Promise<*> {
    if (namespace && id) {
      throw new GeneralError('please use either [id] or [namespace] to add a particular component');
    }

    const normalizedPaths: PathOsBased[] = paths.map(p => path.normalize(p));
    const testsArray: PathOrDSL[] = tests ? this.splitList(tests).map(filePath => path.normalize(filePath.trim())) : [];
    const excludedFiles: PathOrDSL[] = exclude
      ? this.splitList(exclude).map(filePath => path.normalize(filePath.trim()))
      : [];

    // check if user is trying to add test files only without id
    if (!R.isEmpty(tests) && !id && R.isEmpty(normalizedPaths)) {
      throw new AddTestsWithoutId();
    }

    return add({
      componentPaths: normalizedPaths,
      id,
      main: main ? path.normalize(main) : undefined,
      namespace,
      tests: testsArray,
      exclude: excludedFiles,
      override
    });
  }

  report({ addedComponents, warnings }: AddActionResults): string {
    const paintWarning = () => {
      const alreadyUsedOutput = () => {
        const alreadyUsedWarning = Object.keys(warnings.alreadyUsed)
          .map(key =>
            chalk.yellow(
              `warning: files ${chalk.bold(warnings.alreadyUsed[key].join(', '))} already used by component: ${key}`
            )
          )
          .filter(x => x)
          .join('\n');
        return R.isEmpty(alreadyUsedWarning) ? '' : `${alreadyUsedWarning}\n`;
      };
      const emptyDirectoryOutput = () => {
        if (!warnings.emptyDirectory.length) return '';
        return chalk.yellow(
          `warning: the following directories are empty or all their files were excluded\n${chalk.bold(
            warnings.emptyDirectory.join('\n')
          )}\n`
        );
      };
      return alreadyUsedOutput() + emptyDirectoryOutput();
    };

    if (addedComponents.length > 1) {
      return paintWarning() + chalk.green(`tracking ${addedComponents.length} new components`);
    }

    return (
      paintWarning() +
      R.flatten(
        addedComponents.map((result: AddResult) => {
          if (result.files.length === 0) {
            return chalk.underline.red(`could not track component ${chalk.bold(result.id)}: no files to track`);
          }
          const title = chalk.underline(`tracking component ${chalk.bold(result.id)}:\n`);
          const files = result.files.map(file => chalk.green(`added ${file.relativePath}`));
          return title + files.join('\n');
        })
      ).join('\n\n')
    );
  }
}
