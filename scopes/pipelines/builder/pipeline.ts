import { BuildTask } from "@teambit/builder";
import { EnvContext, EnvHandler, reduceServiceHandlersFactories } from "@teambit/envs";
import { Task } from './task';

export type TaskHandler = EnvHandler<Task>;

/**
 * create and maintain build pipelines for component
 * dev environments.
 */
export class Pipeline {
  constructor(
    private _tasks: TaskHandler[],
  ) {}

  /**
   * list all tasks in the build pipeline.
   */
  get tasks() {
    return this._tasks;
  }

  private initiateTasks(tasks: TaskHandler[], context: EnvContext, envId: string) {
    const _tasks = tasks.map((task) => {
      return task(context);
    });

    return _tasks.map((task) => {
      const buildTask: BuildTask = {
        aspectId: envId,
        ...task
      };
      
      return buildTask;
    });
  }

  /**
   * add a build task to the pipeline.
   */
  add(tasks: TaskHandler[]) {
    this._tasks = this._tasks.concat(tasks);
    return this;
  }

  /**
   * remove a build task from the pipeline.
   */
  remove(taskNames: string[]) {
    this._tasks = this._tasks.filter((task) => {
      return taskNames.includes(task.name);
    });
  }

  /**
   * replace a build task in the pipeline.
   */
  replace(tasks: TaskHandler[]) {
    this.remove(tasks.map((task) => task.name));
    this.add(tasks);
    return this;
  }

  /**
   * return a new pipeline with the tasks from the pipeline args added.
   * @param pipeline
   * @returns
   */
  concat(pipeline: Pipeline) {
    return new Pipeline(this._tasks.concat(pipeline.tasks));
  }

  /**
   * compute the pipeline.
   */
  compute(context: EnvContext, envId: string): BuildTask[] {
    const buildTasks = this.initiateTasks(this._tasks, context, envId);
    return buildTasks;
  }

  static from(tasks: TaskHandler[]) {
    return new Pipeline(tasks);
  }

  static concat(...pipelines: EnvHandler<Pipeline>[]) {
    return reduceServiceHandlersFactories(pipelines, (acc, pipeline) => {
      return acc.concat(pipeline);
    });
  }
}
