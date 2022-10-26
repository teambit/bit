import { BuildTask } from "./build-task";


export class Pipeline {
  constructor() {}

  /**
   * add new tasks to the build pipeline.
   */
  add(tasks: BuildTask[]) {
    return this;
  }

  /**
   * add a dependency between two build tasks.
   */
  addDependency(srcId: string, targetId: string) {
    return this;
  }

  /**
   * replace an existing task.
   */
  replace() {
    return this;
  }

  remove() {
    return this;
  }
}

