import { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import * as path from 'path';
import { BitError } from '@teambit/bit-error';
import { PathLinux, PathOsBased } from '@teambit/legacy/dist/utils/path';
import R from 'ramda';
import { AddActionResults, Warnings } from './add-components';
import { TrackerMain } from './tracker.main.runtime';

type AddFlags = {
  id: string | null | undefined;
  main: string | null | undefined;
  namespace: string | null | undefined;
  scope?: string;
  env?: string;
  override: boolean;
};

type AddResults = {
  addedComponents: Array<{ id: string; files: PathLinux[] }>;
  warnings: Warnings;
};

export class AddCmd implements Command {
  name = 'add [path...]';
  description = 'Add any subset of files to be tracked as a component(s).';
  group = 'development';
  extendedDescription = 'Learn the recommended workflow for tracking directories as components, in the link below.';
  helpUrl = 'docs/workspace/creating-workspaces?new_existing_project=1';
  alias = 'a';
  options = [
    ['i', 'id <name>', 'manually set component id'],
    ['m', 'main <file>', 'define entry point for the components'],
    ['n', 'namespace <namespace>', 'organize component in a namespace'],
    ['o', 'override <boolean>', 'override existing component if exists (default = false)'],
    ['s', 'scope <string>', `sets the component's scope-name. if not entered, the default-scope will be used`],
    ['e', 'env <string>', "set the component's environment. (overrides the env from variants if exists)"],
    ['j', 'json', 'output as json format'],
  ] as CommandOptions;
  loader = true;
  migration = true;

  constructor(private tracker: TrackerMain) {}

  async report([paths = []]: [string[]], addFlags: AddFlags) {
    const { addedComponents, warnings }: AddResults = await this.json([paths], addFlags);

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
        addedComponents.map((result) => {
          if (result.files.length === 0) {
            return chalk.underline.red(`could not track component ${chalk.bold(result.id)}: no files to track`);
          }
          const title = chalk.underline(`tracking component ${chalk.bold(result.id)}:\n`);
          const files = result.files.map((file) => chalk.green(`added ${file}`));
          return title + files.join('\n');
        })
      ).join('\n\n')
    );
  }

  async json(
    [paths = []]: [string[]],
    { id, main, namespace, scope, env, override = false }: AddFlags
  ): Promise<AddResults> {
    if (namespace && id) {
      throw new BitError('please use either [id] or [namespace] to add a particular component');
    }

    const normalizedPaths: PathOsBased[] = paths.map((p) => path.normalize(p));
    const { addedComponents, warnings }: AddActionResults = await this.tracker.addForCLI({
      componentPaths: normalizedPaths,
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      id,
      main: main ? path.normalize(main) : undefined,
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      namespace,
      defaultScope: scope,
      override,
      env,
    });
    return {
      addedComponents: addedComponents.map((added) => ({
        id: added.id.toString(),
        files: added.files.map((f) => f.relativePath),
      })),
      warnings,
    };
  }
}
