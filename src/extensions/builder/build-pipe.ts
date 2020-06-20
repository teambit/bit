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
    return pMapSeries(this.tasks, async (task: BuildTask) => {
      this.logger.info(
        task.extensionId,
        `running task "${task.extensionId}" on ${buildContext.components.length} components`
      );
      const taskResult = await task.execute(buildContext);
      const taskProcess = new TaskProcess(task, taskResult, buildContext);
      taskProcess.throwIfErrorsFound();
      this.logger.info(task.extensionId, `task "${task.extensionId}" has completed successfully`);
      await taskProcess.saveTaskResults();
      // @todo: return summery results?
    });
  }

  /**
   * create a build pipe from an array of tasks.
   */
  static from(tasks: BuildTask[], logger: LogPublisher) {
    return new BuildPipe(tasks, logger);
  }
}
