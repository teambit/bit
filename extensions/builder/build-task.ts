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
   * aspect id serialized of the creator of the task.
   * todo: automate this so then it won't be needed to pass manually.
   */
  aspectId: string;

  /**
   * name of the task. function as an identifier among other tasks of the same aspectId.
   * spaces and special characters are not allowed. as a convention, use UpperCamelCase style.
   * (e.g. TypescriptCompiler).
   */
  name: string;

  /**
   * description of what the task does.
   * if available, the logger will log it show it in the status-line.
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
