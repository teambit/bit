import type { Component } from '@teambit/component';
import { ExecutionContext } from '@teambit/envs';
import type { Network } from '@teambit/isolator';
import type { ComponentResult } from './types';
import type { ArtifactDefinition } from './artifact';
import { TaskResultsList } from './task-results-list';

export type TaskLocation = 'start' | 'end';

/**
 * delimiter between task.aspectId and task.name
 */
export const TaskIdDelimiter = ':';

export interface BuildContext extends ExecutionContext {
  /**
   * all components about to be built/tagged.
   */
  components: Component[];

  /**
   * network of capsules ready to be built.
   */
  capsuleNetwork: Network;
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

  /**
   * run before the build pipeline has started. this is useful when some preparation are needed to
   * be done on all envs before the build starts.
   * e.g. typescript compiler needs to write the tsconfig file. doing it during the task, will
   * cause dependencies from other envs to get this tsconfig written.
   */
  preBuild?(context: BuildContext): Promise<void>;

  /**
   * run after the build pipeline completed for all envs. useful for doing some cleanup on the
   * capsules before the deployment starts.
   */
  postBuild?(context: BuildContext, tasksResults: TaskResultsList): Promise<void>;

  /**
   * needed if you want the task to be running only after the dependencies were completed
   * for *all* envs.
   * normally this is not needed because the build-pipeline runs the tasks in the same order
   * they're located in the `getBuildPipe()` array and according to the task.location.
   * the case where this is useful is when a task not only needs to be after another task, but also
   * after all environments were running that task.
   * a dependency is task.aspectId. if an aspect has multiple tasks, to be more specific, use
   * "aspectId:name", e.g. "teambit.compilation/compiler:TypescriptCompiler".
   */
  dependencies?: string[];
}

// TODO: rename to BuildTaskResults
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

export class BuildTaskHelper {
  static serializeId({ aspectId, name }: BuildTask): string {
    return aspectId + TaskIdDelimiter + name;
  }
  static deserializeId(id: string): { aspectId: string; name?: string } {
    const split = id.split(TaskIdDelimiter);
    if (split.length === 0) throw new Error(`deserializeId, ${id} is empty`);
    if (split.length === 1) return { aspectId: split[0] };
    if (split.length === 2) return { aspectId: split[0], name: split[1] };
    throw new Error(`deserializeId, id ${id} has more than one ${TaskIdDelimiter}`);
  }
}
