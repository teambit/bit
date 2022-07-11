import chalk from 'chalk';
import * as path from 'path';
import R from 'ramda';

import { add } from '../../../api/consumer';
import { BASE_DOCS_DOMAIN } from '../../../constants';
import { AddActionResults, AddResult } from '../../../consumer/component-ops/add-components/add-components';
import GeneralError from '../../../error/general-error';
import { PathOsBased } from '../../../utils/path';
import { Group } from '../../command-groups';
import { CommandOptions, LegacyCommand } from '../../legacy-command';

export default class Add implements LegacyCommand {
  name = 'add [path...]';
  description = 'Add any subset of files to be tracked as a component(s).';
  group: Group = 'development';
  extendedDescription = `all flags support glob patterns and {PARENT} {FILE_NAME} annotations
  https://${BASE_DOCS_DOMAIN}/components/adding-components`;
  alias = 'a';
  opts = [
    ['i', 'id <name>', 'manually set component id'],
    ['m', 'main <file>', 'define entry point for the components'],
    ['n', 'namespace <namespace>', 'organize component in a namespace'],
    ['o', 'override <boolean>', 'override existing component if exists (default = false)'],
    ['s', 'scope <string>', `sets the component's scope-name. if not entered, the default-scope will be used`],
  ] as CommandOptions;
  loader = true;
  migration = true;

  action(
    [paths = []]: [string[]],
    {
      id,
      main,
      namespace,
      scope,
      override = false,
    }: {
      id: string | null | undefined;
      main: string | null | undefined;
      namespace: string | null | undefined;
      scope?: string;
      override: boolean;
    }
  ): Promise<any> {
    if (namespace && id) {
      throw new GeneralError('please use either [id] or [namespace] to add a particular component');
    }

    const normalizedPaths: PathOsBased[] = paths.map((p) => path.normalize(p));
    return add({
      componentPaths: normalizedPaths,
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      id,
      main: main ? path.normalize(main) : undefined,
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      namespace,
      defaultScope: scope,
      override,
    });
  }

  splitList(val: string) {
    return val.split(',');
  }

  report({ addedComponents, warnings }: AddActionResults): string {
    const paintWarning = () => {
      const alreadyUsedOutput = () => {
        const alreadyUsedWarning = Object.keys(warnings.alreadyUsed)
          .map((key) =>
            chalk.yellow(
              `warning: files ${chalk.bold(warnings.alreadyUsed[key].join(', '))} already used by component: ${key}`
            )
          )
          .filter((x) => x)
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
            return chalk.underline.red(
              `could not track component ${chalk.bold(result.id.toString())}: no files to track`
            );
          }
          const title = chalk.underline(`tracking component ${chalk.bold(result.id.toString())}:\n`);
          const files = result.files.map((file) => chalk.green(`added ${file.relativePath}`));
          return title + files.join('\n');
        })
      ).join('\n\n')
    );
  }
}
