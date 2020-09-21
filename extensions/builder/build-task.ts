import type { Component } from '@teambit/component';
import { ExecutionContext } from '@teambit/environments';
import type { Network } from '@teambit/isolator';
import type { ComponentResult } from './types';
import type { ArtifactDefinition } from './artifact';

export type TaskLocation = 'start' | 'end';

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

export interface BuildTask {
  /**
   * id of the task. this is the extension/aspect id serialized.
   */
  id: string;

  /**
   * name of the task.
   */
  name?: string;

  /**
   * description of what the task does.
   * if available, the logger will log it show it in the status-line.
   * it's helpful to distinguish multiple tasks of the same extension.
   */
  description?: string;

  /**
   * where to put the task, before the env pipeline or after
   */
  location?: TaskLocation;

  /**
   * execute a task in a build context
   */
  execute(context: BuildContext): Promise<BuiltTaskResult>;
}

export interface BuiltTaskResult {
  /**
   * build results for each of the components in the build context.
   */
  componentsResults: ComponentResult[];

  /**
   * array of artifact definitions to generate after a successful build.
   */
  artifacts?: ArtifactDefinition[];
}
