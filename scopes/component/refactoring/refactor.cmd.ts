// eslint-disable-next-line max-classes-per-file
import type { Command, CommandOptions } from '@teambit/cli';
import type { ComponentMain } from '@teambit/component';
// import { PATTERN_HELP } from '@teambit/legacy.constants';
import chalk from 'chalk';
import type { RefactoringMain } from './refactoring.main.runtime';

export class DependencyNameRefactorCmd implements Command {
  name = 'dependency-name <old-id> <new-id>';
  description = "replace the dependency's old package-name with a new one in the code";
  options = [] as CommandOptions;
  group = 'workspace-tools';
  // extendedDescription = `${PATTERN_HELP('refactor dependency-name')}`;
  extendedDescription = `the \`<old-id>\` and \`<new-id>\` arguments can be either a component-id or a package-name.`;

  constructor(
    private refactoringMain: RefactoringMain,
    private componentMain: ComponentMain
  ) {}

  async report([oldId, newId]: [string, string]) {
    const host = this.componentMain.getHost();
    const allComps = await host.list();
    const { changedComponents, oldPackageName, newPackageName } = await this.refactoringMain.refactorDependencyName(
      allComps,
      oldId,
      newId
    );
    await Promise.all(changedComponents.map((comp) => host.write(comp)));
    return `the following components have been changed (${oldPackageName} => ${newPackageName}):\n${changedComponents
      .map((c) => c.id.toString())
      .join('\n')}`;
  }
}

export class RefactorCmd implements Command {
  name = 'refactor <sub-command>';
  alias = '';
  description = 'source code refactoring / codemod';
  options = [];
  group = 'workspace-tools';
  commands: Command[] = [];

  async report([unrecognizedSubcommand]: [string]) {
    return chalk.red(
      `"${unrecognizedSubcommand}" is not a subcommand of "refactor", please run "bit refactor --help" to list the subcommands`
    );
  }
}
