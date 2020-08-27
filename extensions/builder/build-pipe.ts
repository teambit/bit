import { Logger } from '@teambit/logger';
import pMapSeries from 'p-map-series';

import { InvalidTask } from './exceptions';
import { TaskProcess } from './task-process';
import { BuildContext, BuildResults,BuildTask } from './types';

export class BuildPipe {
  constructor(
    /**
     * array of services to apply on the components.
     */
    readonly tasks: BuildTask[],
    readonly logger: Logger
  ) {}

  /**
   * execute a pipeline of build tasks.
   */
  async execute(buildContext: BuildContext): Promise<BuildResults[]> {
    const longProcessLogger = this.logger.createLongProcessLogger('running tasks', this.tasks.length);
    const results = await pMapSeries(this.tasks, async (task: BuildTask) => {
      if (!task) {
        throw new InvalidTask(task);
      }
      longProcessLogger.logProgress(`${task.extensionId} ${task.description || ''}`);
      const taskResult = await task.execute(buildContext);
      const taskProcess = new TaskProcess(task, taskResult, buildContext, this.logger);
      taskProcess.throwIfErrorsFound();
      this.logger.info(`task "${task.extensionId}" has completed successfully`);
      await taskProcess.saveTaskResults();
      this.logger.consoleSuccess();
      return taskResult;
    });
    longProcessLogger.end();
    return results;
  }

  /**
   * create a build pipe from an array of tasks.
   */
  static from(tasks: BuildTask[], logger: Logger) {
    return new BuildPipe(tasks, logger);
  }
}
