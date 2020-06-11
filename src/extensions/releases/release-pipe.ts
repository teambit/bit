import pMapSeries from 'p-map-series';
import { Component } from '../component';
import { Network } from '../isolator/isolator';
import { ExecutionContext } from '../environments';

/**
 * Context of a release
 */
export interface ReleaseContext extends ExecutionContext {
  /**
   * all components about to be released/tagged.
   */
  components: Component[];

  /**
   * graph of capsules ready to be built.
   */
  capsuleGraph: Network;
}

/**
 * release task.
 */
export interface ReleaseTask {
  /**
   * execute a task in a release context
   */
  execute(context: ReleaseContext): Promise<any>;
}

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
    return pMapSeries(this.tasks, (task: ReleaseTask) => task.execute(releaseContext));
  }

  /**
   * create a release pipe from an array of services.
   */
  static from(tasks: ReleaseTask[]) {
    return new ReleasePipe(tasks);
  }
}
