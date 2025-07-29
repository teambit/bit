import type { EnvContext, EnvHandler } from '@teambit/envs';
import { clone, findIndex } from 'lodash';
import type { Task } from './task';
import type { BuildTask } from './build-task';

export type TaskHandler = {
  handler: EnvHandler<Task>;
  name: string;
};

/**
 * create and maintain build pipelines for component
 * dev environments.
 */
export class Pipeline {
  constructor(private _tasks: TaskHandler[]) {}

  /**
   * list all tasks in the build pipeline.
   */
  get tasks() {
    return this._tasks;
  }

  private initiateTasks(tasks: TaskHandler[], context: EnvContext, envId: string) {
    const _tasks = tasks.map((task) => {
      return task.handler(context);
    });

    const buildTasks: BuildTask[] = _tasks.map((task) => {
      // @ts-ignore
      const aspectId = task.aspectId || envId;
      const buildTask: BuildTask = Object.assign(clone(task), { aspectId });
      return buildTask;
    });

    return buildTasks;
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
      return !taskNames.includes(task.name);
    });
    return this;
  }

  /**
   * replace a build task in the pipeline.
   */
  replace(tasks: TaskHandler[]) {
    tasks.forEach((task) => {
      // Find task index using _.findIndex
      const matchIndex = findIndex(this._tasks, (origTask) => {
        return origTask.name === task.name;
      });
      if (matchIndex !== -1) {
        // Replace task at index using native splice
        this._tasks.splice(matchIndex, 1, task);
      } else {
        // Add task if there's no existing task to replace
        this._tasks.push(task);
      }
    });
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
  compute(context: EnvContext): BuildTask[] {
    const buildTasks = this.initiateTasks(this._tasks, context, context.envId.toString());
    return buildTasks;
  }

  static from(tasks: TaskHandler[]) {
    return new Pipeline(tasks);
  }

  // static concat(...pipelines: EnvHandler<Pipeline>[]) {
  //   return reduceServiceHandlersFactories(pipelines, (acc, pipeline) => {
  //     return acc.concat(pipeline);
  //   });
  // }
}
