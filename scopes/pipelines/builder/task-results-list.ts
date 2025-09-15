import chalk from 'chalk';
import type { Logger } from '@teambit/logger';
import { BitError } from '@teambit/bit-error';
import { BuildTaskHelper } from './build-task';
import type { TasksQueue } from './tasks-queue';
import type { TaskResults } from './build-pipe';
import type { ComponentResult } from './types';

export class TaskResultsList {
  constructor(
    public tasksQueue: TasksQueue,
    /**
     * results of all tasks executed in the build pipeline.
     */
    public tasksResults: TaskResults[],

    public capsuleRootDir: string,

    private logger: Logger
  ) {}

  getTasksResults(loose?: boolean) {
    if (loose) {
      // In loose mode, we filter out test/lint tasks
      return this.tasksResults.filter((taskResult) => {
        const isTestOrLintTask = ['teambit.defender/tester', 'teambit.defender/linter'].includes(
          taskResult.task.aspectId
        );
        return !isTestOrLintTask;
      });
    }
    return this.tasksResults;
  }

  hasErrors(loose?: boolean): boolean {
    const tasksResults = this.getTasksResults(loose);
    return tasksResults.some((taskResult) => taskResult.componentsResults.find((c) => c.errors?.length));
  }

  throwErrorsIfExist(loose?: boolean) {
    this.logStackTrace();
    const errorMessage = this.getErrorMessageFormatted(loose);
    if (errorMessage) {
      throw new BitError(errorMessage);
    }
  }

  /**
   * group errors from all tasks and show them nicely to the user
   */
  getErrorMessageFormatted(loose?: boolean): string | null {
    const tasksErrors: string[] = [];
    let totalErrors = 0;
    const tasksResults = this.getTasksResults(loose);
    tasksResults.forEach((taskResult) => {
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

  private logStackTrace() {
    this.tasksResults.forEach((taskResult) => {
      taskResult.componentsResults.forEach((componentResult) => {
        componentResult.errors?.forEach((error) => {
          if (error instanceof Error) {
            this.logger.error(
              `failed running task ${taskResult.task.name} on ${componentResult.component.id.toString()}`,
              error
            );
          }
        });
      });
    });
  }
}
