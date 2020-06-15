import pMapSeries from 'p-map-series';
import { TaskProcess } from './task-process';
import { BuildTask, BuildContext } from './types';

export class BuildPipe {
  constructor(
    /**
     * array of services to apply on the components.
     */
    readonly tasks: BuildTask[]
  ) {}

  /**
   * execute a pipeline of release tasks.
   */
  async execute(releaseContext: BuildContext) {
    return pMapSeries(this.tasks, async (task: BuildTask) => {
      const taskResult = await task.execute(releaseContext);
      const taskProcess = new TaskProcess(task, taskResult, releaseContext);
      taskProcess.throwIfErrorsFound();
      await taskProcess.saveTaskResults();
      // @todo: return summery results?
    });
  }

  /**
   * create a release pipe from an array of services.
   */
  static from(tasks: BuildTask[]) {
    return new BuildPipe(tasks);
  }
}
