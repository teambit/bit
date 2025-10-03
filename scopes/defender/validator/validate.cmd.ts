import type { Command, CommandOptions } from '@teambit/cli';
import type { Logger } from '@teambit/logger';
import type { Workspace } from '@teambit/workspace';
import { OutsideWorkspaceError } from '@teambit/workspace';
import chalk from 'chalk';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy.constants';
import type { ValidatorMain } from './validator.main.runtime';

export class ValidateCmd implements Command {
  name = 'validate [component-pattern]';
  description = 'run type-checking, linting, and testing in sequence';
  extendedDescription = `validates components by running check-types, lint, and test commands in sequence.
stops at the first failure and returns a non-zero exit code.
by default validates only new and modified components. use --all to validate all components.`;
  arguments = [{ name: 'component-pattern', description: COMPONENT_PATTERN_HELP }];
  alias = '';
  group = 'testing';
  options = [
    ['a', 'all', 'validate all components, not only modified and new'],
    ['c', 'continue-on-error', 'run all validation checks even when errors are found'],
  ] as CommandOptions;

  constructor(
    private validator: ValidatorMain,
    private workspace: Workspace,
    private logger: Logger
  ) {}

  async report(
    [pattern]: [string],
    { all = false, continueOnError = false }: { all: boolean; continueOnError: boolean }
  ) {
    if (!this.workspace) throw new OutsideWorkspaceError();

    this.logger.console(chalk.bold('\n🔍 Running validation checks...\n'));

    const startTime = Date.now();
    const components = await this.workspace.getComponentsByUserInput(pattern ? false : all, pattern, true);

    if (components.length === 0) {
      this.logger.console(chalk.yellow('No components found to validate'));
      return { code: 0, data: 'No components found to validate' };
    }

    this.logger.console(`Validating ${components.length} component(s)\n`);

    const result = await this.validator.validate(components, continueOnError);
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);

    if (result.code !== 0) {
      this.logger.console(chalk.red(`\n✗ Validation failed\n`));
      return { code: result.code, data: `Validation failed after ${totalTime} seconds` };
    }

    this.logger.console(chalk.green(`\n✓ All validation checks passed in ${totalTime} seconds\n`));
    return { code: 0, data: `Validation completed successfully in ${totalTime} seconds` };
  }
}
