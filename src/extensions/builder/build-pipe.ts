import pMapSeries from 'p-map-series';
import { TaskProcess } from './task-process';
import { ReleaseTask, ReleaseContext } from './types';

export class ReleasePipe {
  constructor(
    /**
     * array of services to apply on the components.
     */
    readonly tasks: ReleaseTask[]
  ) {}

  /**
   * execute a pipeline of release tasks.
   */
  async execute(releaseContext: ReleaseContext) {
    return pMapSeries(this.tasks, async (task: ReleaseTask) => {
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
  static from(tasks: ReleaseTask[]) {
    return new ReleasePipe(tasks);
  }
}
