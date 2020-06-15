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
   * execute a pipeline of build tasks.
   */
  async execute(buildContext: BuildContext) {
    return pMapSeries(this.tasks, async (task: BuildTask) => {
      const taskResult = await task.execute(buildContext);
      const taskProcess = new TaskProcess(task, taskResult, buildContext);
      taskProcess.throwIfErrorsFound();
      await taskProcess.saveTaskResults();
      // @todo: return summery results?
    });
  }

  /**
   * create a build pipe from an array of tasks.
   */
  static from(tasks: BuildTask[]) {
    return new BuildPipe(tasks);
  }
}
