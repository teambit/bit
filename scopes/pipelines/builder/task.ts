import type { BuildContext, BuiltTaskResult } from './build-task';
import type { TaskResultsList } from './task-results-list';

/**
 * this is the external interface for task. please make
 * sure to use only this interface outside of this builder
 * aspect.
 */
export interface Task {
  /**
   * names ideally with dashes 'typescript'
   */
  name: string;

  /**
   * description of what the task does.
   */
  description?: string;

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
