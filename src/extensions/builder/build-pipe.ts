import pMapSeries from 'p-map-series';
import { TaskProcess } from './task-process';
import { BuildTask, BuildContext } from './types';
import { LogPublisher } from '../types';

export class BuildPipe {
  constructor(
    /**
     * array of services to apply on the components.
     */
    readonly tasks: BuildTask[],
    readonly logger: LogPublisher
  ) {}

  /**
   * execute a pipeline of build tasks.
   */
  async execute(buildContext: BuildContext) {
    const longProcessLogger = this.logger.createLongProcessLogger('running tasks', this.tasks.length);
    const results = await pMapSeries(this.tasks, async (task: BuildTask) => {
      longProcessLogger.logProgress(task.extensionId);
      const taskResult = await task.execute(buildContext);
      const taskProcess = new TaskProcess(task, taskResult, buildContext);
      taskProcess.throwIfErrorsFound();
      this.logger.info(task.extensionId, `task "${task.extensionId}" has completed successfully`);
      const components = await taskProcess.saveTaskResults();
      return components;
    });
    longProcessLogger.end();
    return results;
  }

  /**
   * create a build pipe from an array of tasks.
   */
  static from(tasks: BuildTask[], logger: LogPublisher) {
    return new BuildPipe(tasks, logger);
  }
}
