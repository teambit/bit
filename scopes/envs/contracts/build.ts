import type { LaneId } from '@teambit/lane-id';
import type { Component } from './component';
import type { Network } from './capsule';
import type { EnvHandler } from './env-handler';
import type { ExecutionContext } from './execution-context';
import type { Pipeline } from './pipeline';

/**
 * a folder to write artifacts generated during a build task.
 * excluded by default from the package tar file.
 */
export const CAPSULE_ARTIFACTS_DIR = 'artifacts';

export type TaskLocation = 'start' | 'end';

export type PipeName = 'build' | 'tag' | 'snap';

export type ArtifactDefinition = {
  /**
   * name of the artifact.
   */
  name: string;

  /**
   * aspect id that created the artifact, when it's not the task's aspect id.
   */
  generatedBy?: string;

  description?: string;

  /**
   * glob patterns of files to include in the artifact.
   */
  globPatterns?: string[];

  /**
   * @deprecated use globPatterns instead.
   */
  directories?: string[];

  /**
   * @deprecated use globPatterns instead.
   */
  rootDir?: string;

  /**
   * @deprecated use globPatterns instead.
   */
  dirPrefix?: string;

  /**
   * whether the artifact is per component (default) or is the same for all components of the env.
   */
  context?: 'component' | 'env';
};

export type ComponentResult = {
  component: Component;

  /**
   * metadata generated during the component build. saved in the builder data of the component.
   */
  metadata?: { [key: string]: any };

  /**
   * returning errors fails the pipeline.
   */
  errors?: Array<Error | string>;

  warnings?: string[];

  /**
   * timestamp in milliseconds when the task started.
   */
  startTime?: number;

  /**
   * timestamp in milliseconds when the task ended.
   */
  endTime?: number;

  /**
   * "pending" means the task was skipped because a dependency failed.
   */
  status?: 'pending';
};

export interface BuiltTaskResult {
  /**
   * build results for each of the components in the build context.
   */
  componentsResults: ComponentResult[];

  /**
   * artifacts to generate after a successful build.
   */
  artifacts?: ArtifactDefinition[];
}

export type TaskResults = {
  task: BuildTask;
  componentsResults: ComponentResult[];
  startTime: number;
  endTime: number;
};

export interface TaskResultsList {
  tasksResults: TaskResults[];
}

export interface BuildContext extends ExecutionContext {
  /**
   * all components about to be built.
   */
  components: Component[];

  /**
   * network of capsules ready to be built.
   */
  capsuleNetwork: Network;

  /**
   * results of the tasks that ran before this task.
   */
  previousTasksResults: TaskResults[];

  /**
   * whether the build runs in dev mode.
   */
  dev?: boolean;

  /**
   * the pipeline being executed.
   */
  pipeName: PipeName;

  /**
   * current lane-id. empty when on main.
   */
  laneId?: LaneId;
}

export interface BuildTask {
  /**
   * aspect id of the creator of the task.
   */
  aspectId: string;

  /**
   * name of the task, in UpperCamelCase. unique among the tasks of the same aspectId.
   */
  name: string;

  description?: string;

  /**
   * whether the task runs before or after the env pipeline.
   */
  location?: TaskLocation;

  execute(context: BuildContext): Promise<BuiltTaskResult>;

  /**
   * runs before the build pipeline starts, for all envs.
   */
  preBuild?(context: BuildContext): Promise<void>;

  /**
   * runs after the build pipeline completes for all envs.
   */
  postBuild?(context: BuildContext, tasksResults: TaskResultsList): Promise<void>;

  /**
   * tasks this task depends on, as "aspectId" or "aspectId:name".
   */
  dependencies?: string[];
}

/**
 * a task as an env defines it. Bit adds the aspectId when it computes the pipeline.
 */
export type Task = Pick<BuildTask, 'name' | 'description' | 'execute' | 'preBuild' | 'postBuild' | 'dependencies'>;

export type TaskHandler = {
  handler: EnvHandler<Task>;
  name: string;
};

export interface BuilderEnv {
  build(): Pipeline;
  snap(): Pipeline;
  tag(): Pipeline;
}
