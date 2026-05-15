import type { Command, CommandOptions } from '@teambit/cli';
import { formatTitle, formatSuccessSummary, formatHint, formatWarningSummary, errorSymbol } from '@teambit/cli';
import type { Logger } from '@teambit/logger';
import type { Workspace } from '@teambit/workspace';
import { OutsideWorkspaceError } from '@teambit/workspace';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy.constants';
import type { ValidatorMain } from './validator.main.runtime';
import { validateCommand } from './validator.commands';

const VALID_TASKS = ['check-types', 'lint', 'test'] as const;

export class ValidateCmd implements Command {
  name = validateCommand.name;
  description = validateCommand.description;
  extendedDescription = validateCommand.extendedDescription;
  arguments = validateCommand.arguments;
  alias = validateCommand.alias;
  group = validateCommand.group;
  options = validateCommand.options;

  constructor(
    private validator: ValidatorMain,
    private workspace: Workspace,
    private logger: Logger
  ) {}

  async report(
    [pattern]: [string],
    {
      all = false,
      failFast = false,
      continueOnError = false,
      skipTasks,
    }: { all: boolean; failFast: boolean; continueOnError: boolean; skipTasks?: string }
  ) {
    if (!this.workspace) throw new OutsideWorkspaceError();

    if (continueOnError) {
      this.logger.consoleWarning(
        '--continue-on-error is deprecated and will be removed in a future version. This is now the default behavior.'
      );
    }

    this.logger.console(`\n${formatTitle('Running validation checks...')}\n`);

    const startTime = Date.now();
    const components = await this.workspace.getComponentsByUserInput(pattern ? false : all, pattern, true);

    if (components.length === 0) {
      this.logger.console(formatHint('No components found to validate'));
      return { code: 0, data: 'No components found to validate' };
    }

    this.logger.console(`Validating ${components.length} component(s)\n`);

    const skipTasksParsed = skipTasks
      ? skipTasks
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
      : [];
    const invalidTasks = skipTasksParsed.filter((t) => !VALID_TASKS.includes(t as any));
    if (invalidTasks.length > 0) {
      throw new Error(`unknown skip-tasks: ${invalidTasks.join(', ')}. available tasks: ${VALID_TASKS.join(', ')}`);
    }
    const result = await this.validator.validate(components, failFast, skipTasksParsed);
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);

    if (result.code !== 0) {
      this.logger.console(`\n${errorSymbol} Validation failed\n`);
      return { code: result.code, data: `Validation failed after ${totalTime} seconds` };
    }

    if (result.skippedAll) {
      this.logger.console(`\n${formatWarningSummary('All validation tasks were skipped')}\n`);
      return { code: 0, data: 'All validation tasks were skipped' };
    }

    this.logger.console(`\n${formatSuccessSummary(`All validation checks passed in ${totalTime} seconds`)}\n`);
    return { code: 0, data: `Validation completed successfully in ${totalTime} seconds` };
  }
}
