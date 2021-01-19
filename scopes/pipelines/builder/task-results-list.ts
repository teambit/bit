import chalk from 'chalk';
import { BitError } from '@teambit/bit-error';
import { BuildTaskHelper } from './build-task';
import { TasksQueue } from './tasks-queue';
import { TaskResults } from './build-pipe';
import { ComponentResult } from './types';

export class TaskResultsList {
  constructor(
    public tasksQueue: TasksQueue,
    /**
     * results of all tasks executed in the build pipeline.
     */
    public tasksResults: TaskResults[]
  ) {}

  hasErrors(): boolean {
    return this.tasksResults.some((taskResult) => taskResult.componentsResults.find((c) => c.errors?.length));
  }

  throwErrorsIfExist() {
    const errorMessage = this.getErrorMessageFormatted();
    if (errorMessage) {
      throw new BitError(errorMessage);
    }
  }

  /**
   * group errors from all tasks and show them nicely to the user
   */
  public getErrorMessageFormatted(): string | null {
    const tasksErrors: string[] = [];
    let totalErrors = 0;
    this.tasksResults.forEach((taskResult) => {
      const compsWithErrors = taskResult.componentsResults.filter((c) => c.errors?.length);
      if (!compsWithErrors.length) return;
      const title = chalk.bold(
        `Failed task ${tasksErrors.length + 1}: "${BuildTaskHelper.serializeId(taskResult.task)}" of env "${
          taskResult.env.id
        }"\n`
      );
      const errorsStr = compsWithErrors
        .map((compWithErrors) => this.aggregateTaskErrorsToOneString(compWithErrors))
        .join('\n\n');
      const taskErrors = compsWithErrors.reduce((acc, current) => acc + (current.errors || []).length, 0);
      const summery = `\n\nFound ${taskErrors} errors in ${compsWithErrors.length} components`;
      totalErrors += taskErrors;
      tasksErrors.push(title + errorsStr + summery);
    });
    if (!tasksErrors.length) return null;
    const title = `\nThe following errors were found while running the build pipeline\n`;
    const errorsStr = tasksErrors.join('\n\n');
    const totalTasks = this.tasksQueue.length;
    const totalFailed = tasksErrors.length;
    const totalSucceed = this.tasksResults.length - totalFailed;
    const totalSkipped = totalTasks - this.tasksResults.length;
    const summery = `\n\n\n✖ Total ${totalTasks} tasks. ${totalSucceed} succeeded. ${totalFailed} failed. ${totalSkipped} skipped. Total errors: ${totalErrors}.`;
    return title + errorsStr + summery;
  }

  private aggregateTaskErrorsToOneString(componentResult: ComponentResult) {
    const rawErrors = componentResult.errors || [];
    const errors = rawErrors.map((e) => (typeof e === 'string' ? e : e.toString()));
    return `component: ${componentResult.component.id.toString()}\n${errors.join('\n')}`;
  }
}
