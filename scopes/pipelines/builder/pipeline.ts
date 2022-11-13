import { BuildTask } from "@teambit/builder";
import { EnvContext, EnvHandler } from "@teambit/envs";

export type Task = EnvHandler<BuildTask>;

/**
 * create and maintain build pipelines for component 
 * dev environments.
 */
export class Pipeline {
  constructor(
    private _tasks: BuildTask[],
    private context: EnvContext
  ) {}

  /**
   * list all tasks in the build pipeline.
   */
  get tasks() {
    return this._tasks;
  }

  private initiateTasks(tasks: Task[]) {
    return tasks.map((task) => {
      return task(this.context);
    });
  }

  /**
   * add a build task to the pipeline.
   */
  add(tasks: Task[]) {
    const buildTasks = this.initiateTasks(tasks);
    this._tasks = this._tasks.concat(buildTasks);
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
  replace(tasks: Task[]) {
    const buildTasks = this.initiateTasks(tasks);
    this.remove(buildTasks.map((task) => task.name));
    this.add(tasks);
    return this;
  }

  /**
   * compute the pipeline.
   */
  compute() {
    return this._tasks;
  }

  static from(tasks: Task[]) {    
    return (context: EnvContext) => {
      const buildTasks = tasks.map((taskFn) => {
        return taskFn(context);
      });

      return new Pipeline(buildTasks, context);
    }
  }
}
