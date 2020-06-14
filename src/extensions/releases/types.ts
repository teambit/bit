import { Component, ComponentID } from '../component';
import { Network } from '../isolator/isolator.extension';
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

export interface ReleaseResults {
  components: Array<{ id: ComponentID; data?: any; errors: Array<Error | string>; warning?: string[] }>;
  artifacts: Array<{ dirName: string }>;
}

/**
 * release task.
 */
export interface ReleaseTask {
  /**
   * extensionId hosting this task.
   * @todo: should be automatically injected by Harmony
   */
  extensionId: string;
  /**
   * execute a task in a release context
   */
  execute(context: ReleaseContext): Promise<ReleaseResults>;
}
