import { Component, ComponentID } from '../component';
import { Network } from '../isolator';
import { ExecutionContext } from '../environments';

export interface BuildContext extends ExecutionContext {
  /**
   * all components about to be built/tagged.
   */
  components: Component[];

  /**
   * graph of capsules ready to be built.
   */
  capsuleGraph: Network;
}

export interface BuildResults {
  components: Array<{ id: ComponentID; data?: any; errors: Array<Error | string>; warning?: string[] }>;
  artifacts: Array<{ dirName: string }>;
}

export interface BuildTask {
  /**
   * extensionId hosting this task.
   * @todo: should be automatically injected by Harmony
   */
  extensionId: string;
  /**
   * execute a task in a build context
   */
  execute(context: BuildContext): Promise<BuildResults>;
}
