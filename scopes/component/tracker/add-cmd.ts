import type { Command, CommandOptions } from '@teambit/cli';
import { formatTitle, formatItem, formatSuccessSummary, warnSymbol, errorSymbol, joinSections } from '@teambit/cli';
import chalk from 'chalk';
import * as path from 'path';
import { BitError } from '@teambit/bit-error';
import type { PathLinux, PathOsBased } from '@teambit/legacy.utils';
import { pathNormalizeToLinux } from '@teambit/legacy.utils';
import type { AddActionResults, Warnings } from './add-components';
import type { TrackerMain } from './tracker.main.runtime';

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
  description = 'track existing directory contents as new components in the workspace';
  group = 'component-development';
  extendedDescription =
    'Registers one or more directories as Bit components without changing your files. Each provided path becomes a component root tracked by Bit.';
  helpUrl = 'reference/workspace/component-directory';
  alias = 'a';
  options = [
    ['i', 'id <name>', 'manually set component id'],
    ['m', 'main <file>', 'define component entry point'],
    ['n', 'namespace <namespace>', 'organize component in a namespace'],
    ['o', 'override <boolean>', 'override existing component if exists (default = false)'],
    [
      's',
      'scope <string>',
      `sets the component's scope. if not entered, the default-scope from workspace.jsonc will be used`,
    ],
    ['e', 'env <string>', "set the component's environment. (overrides the env from variants if exists)"],
    ['j', 'json', 'output as json format'],
  ] as CommandOptions;
  loader = true;

  constructor(private tracker: TrackerMain) {}

  async report([paths = []]: [string[]], addFlags: AddFlags) {
    const { addedComponents, warnings }: AddResults = await this.json([paths], addFlags);

    const paintWarning = () => {
      const alreadyUsedOutput = () => {
        const alreadyUsedWarning = Object.keys(warnings.alreadyUsed)
          .map((key) =>
            formatItem(
              `files ${chalk.bold(warnings.alreadyUsed[key].join(', '))} already used by component: ${key}`,
              warnSymbol
            )
          )
          .filter((x) => x)
          .join('\n');
        return alreadyUsedWarning ? `${alreadyUsedWarning}\n` : '';
      };
      const emptyDirectoryOutput = () => {
        if (!warnings.emptyDirectory.length) return '';
        const items = warnings.emptyDirectory.map((dir) => formatItem(chalk.bold(dir), warnSymbol));
        return `${formatTitle(`${warnSymbol} empty or excluded directories`)}\n${items.join('\n')}\n`;
      };
      return alreadyUsedOutput() + emptyDirectoryOutput();
    };

    if (addedComponents.length > 1) {
      return paintWarning() + formatSuccessSummary(`tracking ${addedComponents.length} new components`);
    }

    return joinSections([
      paintWarning(),
      ...addedComponents.map((result) => {
        if (result.files.length === 0) {
          return `${errorSymbol} could not track component ${chalk.bold(result.id)}: no files to track`;
        }
        const title = formatTitle(`tracking component ${chalk.bold(result.id)}`);
        const files = result.files.map((file) => formatItem(`added ${file}`));
        return `${title}\n${files.join('\n')}`;
      }),
    ]);
  }

  async json(
    [paths = []]: [string[]],
    { id, main, namespace, scope, env, override = false }: AddFlags
  ): Promise<AddResults> {
    if (namespace && id) {
      throw new BitError(
        'please use either [id] or [namespace] to add a particular component - they cannot be used together'
      );
    }

    const normalizedPaths: PathOsBased[] = paths.map((p) => pathNormalizeToLinux(path.normalize(p)));
    const { addedComponents, warnings }: AddActionResults = await this.tracker.addForCLI({
      componentPaths: normalizedPaths,
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      id,
      main: main ? pathNormalizeToLinux(path.normalize(main)) : undefined,
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
